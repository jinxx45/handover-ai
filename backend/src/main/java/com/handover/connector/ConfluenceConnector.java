package com.handover.connector;

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
 * Confluence pages the person created or edited recently, one item per space. These count as existing
 * documentation, and their titles and excerpts give the agent context so it doesn't ask what is already written.
 */
@Component
public class ConfluenceConnector implements WorkConnector {

    private static final Logger log = LoggerFactory.getLogger(ConfluenceConnector.class);

    private final RestClient client;
    private final String baseUrl;

    public ConfluenceConnector(HandoverProperties props) {
        HandoverProperties.Confluence config = props.connectors() == null ? null : props.connectors().confluence();
        if (config == null || !config.configured()) {
            this.client = null;
            this.baseUrl = null;
            return;
        }
        this.baseUrl = ConnectorSupport.trimSlash(config.baseUrl());
        this.client = RestClient.builder().baseUrl(baseUrl)
                .defaultHeader("Authorization", ConnectorSupport.atlassianAuth(config.email(), config.token()))
                .build();
    }

    @Override
    public String name() {
        return "confluence";
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
        String cql = "type = page AND (creator = \"" + user + "\" OR contributor = \"" + user + "\") AND lastmodified >= now(\"-"
                + ConnectorSupport.LOOKBACK_DAYS + "d\") ORDER BY lastmodified DESC";
        try {
            JsonNode result = client.get()
                    .uri(b -> b.path("/rest/api/content/search").queryParam("cql", cql)
                            .queryParam("limit", 50).queryParam("expand", "space,version").build())
                    .retrieve()
                    .body(JsonNode.class);
            Map<String, List<JsonNode>> bySpace = new LinkedHashMap<>();
            if (result != null) {
                for (JsonNode page : result.path("results")) {
                    bySpace.computeIfAbsent(page.path("space").path("name").asText("Confluence"), k -> new ArrayList<>()).add(page);
                }
            }
            List<DiscoveredItem> items = new ArrayList<>();
            bySpace.forEach((space, pages) -> {
                List<String> evidence = pages.stream().limit(12)
                        .map(p -> "Page '" + p.path("title").asText() + "' (version " + p.path("version").path("number").asText("?") + ")")
                        .toList();
                String url = pages.isEmpty() ? null : baseUrl + pages.get(0).path("_links").path("webui").asText("");
                items.add(new DiscoveredItem("doc", "Confluence pages in " + space, "confluence", url, pages.size(), true,
                        null, null, false, evidence));
            });
            return items;
        } catch (RestClientException e) {
            log.warn("Confluence discovery failed: {}", e.getMessage());
            return List.of();
        }
    }
}
