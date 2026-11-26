package com.handover.connector;

import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import com.fasterxml.jackson.databind.JsonNode;
import com.handover.config.HandoverProperties;

/**
 * Finds where the person is the real owner of code, not just a contributor:
 * <ul>
 *   <li><b>Ownership share</b>: their commits as a share of all commits to each repo in the lookback window.</li>
 *   <li><b>Sole-owner files</b>: files they recently changed where they made at least 80% of all commits.</li>
 *   <li><b>CODEOWNERS</b>: paths where they are a required reviewer. Those become approval items that must be
 *       reassigned, or pull requests get stuck the day they leave.</li>
 *   <li><b>Runbook</b>: whether the repo has operational docs.</li>
 * </ul>
 * Works with GitHub.com and GitHub Enterprise (api-url = https://host/api/v3). Enabled when GITHUB_TOKEN and
 * GITHUB_ORG are set and the event carries a githubLogin.
 */
@Component
public class GitHubConnector implements WorkConnector {

    private static final Logger log = LoggerFactory.getLogger(GitHubConnector.class);
    private static final int MAX_REPOS = 8;
    private static final int DEEP_SCAN_REPOS = 3;
    private static final int MAX_FILES_PER_REPO = 15;
    private static final double SOLE_OWNER_SHARE = 0.8;
    private static final List<String> DOC_PATHS = List.of("RUNBOOK.md", "docs/RUNBOOK.md", "docs/runbook.md", "OPERATIONS.md");
    private static final List<String> CODEOWNERS_PATHS = List.of(".github/CODEOWNERS", "CODEOWNERS", "docs/CODEOWNERS");

    private final HandoverProperties.Github config;
    private final RestClient client;

    public GitHubConnector(HandoverProperties props) {
        this.config = props.connectors() == null ? null : props.connectors().github();
        this.client = config == null || !config.configured() ? null : RestClient.builder()
                .baseUrl(ConnectorSupport.trimSlash(config.apiUrl()))
                .defaultHeader("Authorization", "Bearer " + config.token())
                .defaultHeader("Accept", "application/vnd.github+json")
                .build();
    }

    @Override
    public String name() {
        return "github";
    }

    @Override
    public boolean enabled() {
        return client != null;
    }

    @Override
    public List<DiscoveredItem> discover(PersonRef person) {
        String login = person.githubLogin();
        if (!ConnectorSupport.present(login)) {
            return List.of();
        }
        String since = Instant.now().minus(ConnectorSupport.LOOKBACK_DAYS, ChronoUnit.DAYS).toString();
        Map<String, RepoStats> repos = findReposWithCommits(login);

        // Measure the share for every candidate repo, then keep the ones the person really owns.
        for (RepoStats r : repos.values()) {
            measureShare(r, login, since);
        }
        List<RepoStats> ranked = repos.values().stream()
                .sorted((a, b) -> Double.compare(b.score(), a.score()))
                .limit(MAX_REPOS)
                .toList();

        List<DiscoveredItem> items = new ArrayList<>();
        for (int i = 0; i < ranked.size(); i++) {
            RepoStats r = ranked.get(i);
            if (i < DEEP_SCAN_REPOS) {
                findSoleOwnerFiles(r, login, since);
            }
            items.add(toRepoItem(r));
            DiscoveredItem codeowners = codeownersItem(r, login);
            if (codeowners != null) {
                items.add(codeowners);
            }
        }
        return items;
    }

    // ------------------------------------------------------------------ steps

    private Map<String, RepoStats> findReposWithCommits(String login) {
        String sinceDate = LocalDate.now().minusDays(ConnectorSupport.LOOKBACK_DAYS).toString();
        String query = "author:" + login + " org:" + config.org() + " committer-date:>" + sinceDate;
        Map<String, RepoStats> repos = new LinkedHashMap<>();
        for (int page = 1; page <= 3; page++) {
            final int p = page;
            JsonNode result = get(b -> b.path("/search/commits").queryParam("q", query)
                    .queryParam("per_page", 100).queryParam("page", p).build());
            if (result == null || !result.path("items").elements().hasNext()) {
                break;
            }
            for (JsonNode commit : result.path("items")) {
                String fullName = commit.path("repository").path("full_name").asText();
                if (!fullName.isBlank()) {
                    repos.computeIfAbsent(fullName,
                            n -> new RepoStats(n, commit.path("repository").path("html_url").asText(null)));
                }
            }
        }
        return repos;
    }

    private void measureShare(RepoStats r, String login, String since) {
        Map<String, Integer> byAuthor = new HashMap<>();
        for (int page = 1; page <= 5; page++) {
            JsonNode commits = get("/repos/" + r.fullName + "/commits?since=" + since + "&per_page=100&page=" + page);
            if (commits == null || !commits.isArray() || commits.isEmpty()) {
                break;
            }
            for (JsonNode c : commits) {
                String author = c.path("author").path("login").asText("unknown");
                byAuthor.merge(author.toLowerCase(), 1, Integer::sum);
                r.total++;
                if (author.equalsIgnoreCase(login)) {
                    r.mine++;
                    if (r.recentShas.size() < 10) {
                        r.recentShas.add(c.path("sha").asText());
                    }
                    if (r.messages.size() < 5) {
                        r.messages.add(c.path("commit").path("message").asText("").lines().findFirst().orElse(""));
                    }
                    String date = c.path("commit").path("author").path("date").asText("");
                    if (!date.isBlank()) {
                        long days = ChronoUnit.DAYS.between(OffsetDateTime.parse(date).toLocalDate(), LocalDate.now());
                        r.lastDays = Math.min(r.lastDays, (int) days);
                    }
                }
            }
            if (commits.size() < 100) {
                break;
            }
        }
        r.otherContributors = (int) byAuthor.keySet().stream().filter(a -> !a.equalsIgnoreCase(login)).count();
    }

    private void findSoleOwnerFiles(RepoStats r, String login, String since) {
        Set<String> files = new LinkedHashSet<>();
        for (String sha : r.recentShas) {
            JsonNode commit = get("/repos/" + r.fullName + "/commits/" + sha);
            if (commit == null) {
                continue;
            }
            for (JsonNode f : commit.path("files")) {
                if (files.size() < MAX_FILES_PER_REPO) {
                    files.add(f.path("filename").asText());
                }
            }
        }
        for (String file : files) {
            JsonNode history = get(b -> b.path("/repos/" + r.fullName + "/commits")
                    .queryParam("path", file).queryParam("since", since).queryParam("per_page", 100).build());
            if (history == null || !history.isArray() || history.size() < 2) {
                continue;
            }
            long mine = 0;
            for (JsonNode c : history) {
                if (c.path("author").path("login").asText("").equalsIgnoreCase(login)) {
                    mine++;
                }
            }
            if ((double) mine / history.size() >= SOLE_OWNER_SHARE) {
                r.soleOwnerFiles.add(file + " (" + mine + "/" + history.size() + " commits)");
            }
        }
    }

    private DiscoveredItem toRepoItem(RepoStats r) {
        boolean hasDocs = DOC_PATHS.stream().anyMatch(p -> get("/repos/" + r.fullName + "/contents/" + p) != null);
        double share = r.total == 0 ? 0 : (double) r.mine / r.total;
        List<String> evidence = new ArrayList<>();
        evidence.add(String.format("%s: %d of %d commits in the last %d days (%d%%) are by this person; %d other contributors%s.",
                r.fullName, r.mine, r.total, ConnectorSupport.LOOKBACK_DAYS, Math.round(share * 100), r.otherContributors,
                hasDocs ? "; a runbook exists" : "; no runbook found"));
        if (!r.soleOwnerFiles.isEmpty()) {
            evidence.add("Files where nobody else has made meaningful changes: " + String.join(", ", r.soleOwnerFiles));
        }
        if (!r.messages.isEmpty()) {
            evidence.add("Recent commit messages: " + String.join(" | ", r.messages));
        }
        String languages = languages(r.fullName);
        if (languages != null) {
            evidence.add(r.fullName + " is written in " + languages + ".");
        }
        return new DiscoveredItem("repo", r.fullName, "github", r.url, r.mine, hasDocs,
                r.lastDays == Integer.MAX_VALUE ? null : r.lastDays, share, false, evidence);
    }

    private DiscoveredItem codeownersItem(RepoStats r, String login) {
        String handle = "@" + login.toLowerCase();
        for (String path : CODEOWNERS_PATHS) {
            String text = getRaw("/repos/" + r.fullName + "/contents/" + path);
            if (text == null) {
                continue;
            }
            List<String> owned = new ArrayList<>();
            List<String> soleOwned = new ArrayList<>();
            for (String line : text.lines().toList()) {
                String trimmed = line.trim();
                if (trimmed.isEmpty() || trimmed.startsWith("#")) {
                    continue;
                }
                String[] parts = trimmed.split("\\s+");
                List<String> owners = List.of(parts).subList(1, parts.length).stream().map(String::toLowerCase).toList();
                if (owners.contains(handle)) {
                    owned.add(parts[0]);
                    if (owners.size() == 1) {
                        soleOwned.add(parts[0]);
                    }
                }
            }
            if (owned.isEmpty()) {
                return null;
            }
            List<String> evidence = new ArrayList<>();
            evidence.add("CODEOWNERS in " + r.fullName + " lists this person as required reviewer for: " + String.join(", ", owned));
            if (!soleOwned.isEmpty()) {
                evidence.add("They are the ONLY owner for: " + String.join(", ", soleOwned)
                        + ". Pull requests touching these paths cannot be approved once their account is closed.");
            }
            String url = r.url == null ? null : r.url + "/blob/HEAD/" + path;
            return new DiscoveredItem("approval", "Required code reviewer in " + r.fullName, "github", url,
                    owned.size(), false, null, null, true, evidence);
        }
        return null;
    }

    /** "Kotlin 71%, SQL 18%, Shell 11%" from GitHub's language byte counts, top three only. */
    private String languages(String fullName) {
        JsonNode langs = get("/repos/" + fullName + "/languages");
        if (langs == null || !langs.isObject() || langs.isEmpty()) {
            return null;
        }
        long total = 0;
        List<Map.Entry<String, Long>> entries = new ArrayList<>();
        var it = langs.fields();
        while (it.hasNext()) {
            var e = it.next();
            entries.add(Map.entry(e.getKey(), e.getValue().asLong()));
            total += e.getValue().asLong();
        }
        final long sum = Math.max(total, 1);
        return entries.stream().sorted((a, b) -> Long.compare(b.getValue(), a.getValue())).limit(3)
                .map(e -> e.getKey() + " " + Math.round(e.getValue() * 100.0 / sum) + "%")
                .reduce((a, b) -> a + ", " + b).orElse(null);
    }

    // ------------------------------------------------------------------ http

    private JsonNode get(String path) {
        try {
            return client.get().uri(path).retrieve().body(JsonNode.class);
        } catch (RestClientException e) {
            return null;
        }
    }

    private JsonNode get(java.util.function.Function<org.springframework.web.util.UriBuilder, java.net.URI> uri) {
        try {
            return client.get().uri(uri).retrieve().body(JsonNode.class);
        } catch (RestClientException e) {
            log.debug("GitHub call failed: {}", e.getMessage());
            return null;
        }
    }

    private String getRaw(String path) {
        try {
            return client.get().uri(path).header("Accept", "application/vnd.github.raw+json").retrieve().body(String.class);
        } catch (RestClientException e) {
            return null;
        }
    }

    private static final class RepoStats {
        final String fullName;
        final String url;
        final List<String> messages = new ArrayList<>();
        final List<String> recentShas = new ArrayList<>();
        final List<String> soleOwnerFiles = new ArrayList<>();
        int mine;
        int total;
        int otherContributors;
        int lastDays = Integer.MAX_VALUE;

        RepoStats(String fullName, String url) {
            this.fullName = fullName;
            this.url = url;
        }

        /** Rank by ownership first, activity second. */
        double score() {
            double share = total == 0 ? 0 : (double) mine / total;
            return share * 100 + Math.min(mine, 50);
        }
    }
}
