package com.handover.connector;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import com.fasterxml.jackson.databind.JsonNode;
import com.handover.config.HandoverProperties;

/**
 * Google Drive files the person owns. Files owned by a deleted account can disappear, so shared files become a
 * "transfer ownership" item that must be reassigned, plus a docs item the agent can use as context.
 */
@Component
public class GoogleDriveConnector implements WorkConnector {

    private static final Logger log = LoggerFactory.getLogger(GoogleDriveConnector.class);

    private final RestClient client;

    public GoogleDriveConnector(HandoverProperties props) {
        HandoverProperties.Google config = props.connectors() == null ? null : props.connectors().google();
        this.client = config == null || !config.configured() || !config.driveEnabled() ? null : RestClient.builder()
                .baseUrl("https://www.googleapis.com/drive/v3")
                .defaultHeader("Authorization", "Bearer " + config.accessToken())
                .build();
    }

    @Override
    public String name() {
        return "google-drive";
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
        String since = Instant.now().minus(ConnectorSupport.LOOKBACK_DAYS, ChronoUnit.DAYS).toString();
        String q = "'" + person.email().replace("'", "") + "' in owners and modifiedTime > '" + since + "' and trashed = false";
        try {
            JsonNode result = client.get()
                    .uri(b -> b.path("/files").queryParam("q", q).queryParam("pageSize", 100)
                            .queryParam("orderBy", "modifiedTime desc")
                            .queryParam("fields", "files(id,name,mimeType,webViewLink,modifiedTime,shared)").build())
                    .retrieve()
                    .body(JsonNode.class);
            List<JsonNode> files = new ArrayList<>();
            if (result != null) {
                result.path("files").forEach(files::add);
            }
            if (files.isEmpty()) {
                return List.of();
            }
            List<JsonNode> shared = files.stream().filter(f -> f.path("shared").asBoolean(false)).toList();
            List<DiscoveredItem> items = new ArrayList<>();
            items.add(new DiscoveredItem("doc", "Google Drive documents", "google-drive", null, files.size(), true, null,
                    null, false, files.stream().limit(15).map(f -> "Doc '" + f.path("name").asText() + "'").toList()));
            if (!shared.isEmpty()) {
                items.add(new DiscoveredItem("approval", "Transfer ownership of " + shared.size() + " shared Drive files",
                        "google-drive", null, shared.size(), false, null, null, true,
                        List.of("Shared files owned by this person: " + String.join(", ",
                                shared.stream().limit(15).map(f -> f.path("name").asText()).toList())
                                + ". Transfer ownership before the account is deleted.")));
            }
            return items;
        } catch (RestClientException e) {
            log.warn("Google Drive discovery failed: {}", e.getMessage());
            return List.of();
        }
    }
}
