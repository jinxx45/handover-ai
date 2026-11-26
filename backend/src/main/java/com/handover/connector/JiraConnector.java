package com.handover.connector;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import com.fasterxml.jackson.databind.JsonNode;
import com.handover.config.HandoverProperties;

/**
 * Two things from Jira:
 * <ol>
 *   <li><b>Open work</b>: unresolved or recently updated issues assigned to the person, one item per project.</li>
 *   <li><b>Approvals</b> (Jira Service Management): request types the person approves, from pending and recent
 *       approvals. Each becomes an approval item that must be reassigned, and the agent interviews them on their
 *       decision criteria.</li>
 * </ol>
 * Enabled when JIRA_BASE_URL and JIRA_TOKEN are set. With JIRA_EMAIL: basic auth (Cloud); without: bearer (Server/DC).
 */
@Component
public class JiraConnector implements WorkConnector {

    private static final Logger log = LoggerFactory.getLogger(JiraConnector.class);
    private static final String DEFAULT_PENDING = "approval = pendingBy(\"{user}\")";
    private static final String DEFAULT_HISTORY = "approval = approvedBy(\"{user}\") AND updated >= -180d";

    private final RestClient client;
    private final String baseUrl;
    private final String pendingJql;
    private final String historyJql;

    public JiraConnector(HandoverProperties props) {
        HandoverProperties.Jira config = props.connectors() == null ? null : props.connectors().jira();
        if (config == null || !config.configured()) {
            this.client = null;
            this.baseUrl = null;
            this.pendingJql = DEFAULT_PENDING;
            this.historyJql = DEFAULT_HISTORY;
            return;
        }
        this.baseUrl = ConnectorSupport.trimSlash(config.baseUrl());
        this.client = RestClient.builder().baseUrl(baseUrl)
                .defaultHeader("Authorization", ConnectorSupport.atlassianAuth(config.email(), config.token()))
                .build();
        this.pendingJql = ConnectorSupport.present(config.approvalJqlPending()) ? config.approvalJqlPending() : DEFAULT_PENDING;
        this.historyJql = ConnectorSupport.present(config.approvalJqlHistory()) ? config.approvalJqlHistory() : DEFAULT_HISTORY;
    }

    @Override
    public String name() {
        return "jira";
    }

    @Override
    public boolean enabled() {
        return client != null;
    }

    @Override
    public List<DiscoveredItem> discover(PersonRef person) {
        if (!ConnectorSupport.present(person.email())) {
            return List.of();
        }
        String user = person.email().replace("\"", "");
        List<DiscoveredItem> items = new ArrayList<>(openWork(user));
        items.addAll(approvals(user));
        return items;
    }

    private List<DiscoveredItem> openWork(String user) {
        String jql = "assignee = \"" + user + "\" AND (resolution = Unresolved OR updated >= -90d) ORDER BY updated DESC";
        Map<String, List<JsonNode>> byProject = new LinkedHashMap<>();
        for (JsonNode issue : search(jql)) {
            byProject.computeIfAbsent(issue.path("fields").path("project").path("name").asText("Jira"),
                    k -> new ArrayList<>()).add(issue);
        }
        List<DiscoveredItem> items = new ArrayList<>();
        byProject.forEach((project, issues) -> items.add(new DiscoveredItem("ticket_queue", "Open " + project + " tickets",
                "jira", issuesUrl(jql), issues.size(), false, null, null, false, describe(issues, 15))));
        return items;
    }

    private List<DiscoveredItem> approvals(String user) {
        List<JsonNode> pending = search(pendingJql.replace("{user}", user));
        List<JsonNode> history = search(historyJql.replace("{user}", user));
        Map<String, Approvals> byType = new LinkedHashMap<>();
        for (JsonNode i : pending) {
            byType.computeIfAbsent(key(i), k -> new Approvals()).pending.add(i);
        }
        for (JsonNode i : history) {
            byType.computeIfAbsent(key(i), k -> new Approvals()).approved.add(i);
        }
        List<DiscoveredItem> items = new ArrayList<>();
        byType.forEach((type, a) -> {
            List<String> evidence = new ArrayList<>();
            evidence.add(String.format("This person approved %d '%s' requests in the last 180 days and %d are waiting on them now.",
                    a.approved.size(), type, a.pending.size()));
            if (!a.pending.isEmpty()) {
                evidence.add("Pending: " + String.join("; ", describe(a.pending, 8)));
            }
            if (!a.approved.isEmpty()) {
                evidence.add("Recently approved: " + String.join("; ", describe(a.approved, 8)));
            }
            items.add(new DiscoveredItem("approval", "Approves " + type, "jira",
                    issuesUrl(pendingJql.replace("{user}", user)), a.pending.size() + a.approved.size(), false, null,
                    null, true, evidence));
        });
        return items;
    }

    private static String key(JsonNode issue) {
        JsonNode f = issue.path("fields");
        return f.path("issuetype").path("name").asText("requests") + " in " + f.path("project").path("name").asText("Jira");
    }

    private static List<String> describe(List<JsonNode> issues, int limit) {
        return issues.stream().limit(limit).map(i -> i.path("key").asText() + " ("
                + i.path("fields").path("status").path("name").asText() + "): "
                + i.path("fields").path("summary").asText()).toList();
    }

    private String issuesUrl(String jql) {
        return baseUrl + "/issues/?jql=" + URLEncoder.encode(jql, StandardCharsets.UTF_8);
    }

    /** Runs a JQL search; returns an empty list on any error (e.g. approval functions on a non-JSM Jira). */
    private List<JsonNode> search(String jql) {
        try {
            JsonNode result = client.get()
                    .uri(b -> b.path("/rest/api/2/search")
                            .queryParam("jql", jql)
                            .queryParam("fields", "summary,status,project,issuetype,updated")
                            .queryParam("maxResults", 100)
                            .build())
                    .retrieve()
                    .body(JsonNode.class);
            List<JsonNode> issues = new ArrayList<>();
            if (result != null) {
                result.path("issues").forEach(issues::add);
            }
            return issues;
        } catch (RestClientException e) {
            log.warn("Jira search failed ({}): {}", jql, e.getMessage());
            return List.of();
        }
    }

    private static final class Approvals {
        final List<JsonNode> pending = new ArrayList<>();
        final List<JsonNode> approved = new ArrayList<>();
    }
}
