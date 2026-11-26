package com.handover.connector;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
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
 * On-call duties from PagerDuty: escalation policies and schedules the person is on, plus how many incidents
 * they handled. Every on-call slot must be reassigned or pages go nowhere after they leave.
 */
@Component
public class PagerDutyConnector implements WorkConnector {

    private static final Logger log = LoggerFactory.getLogger(PagerDutyConnector.class);

    private final RestClient client;

    public PagerDutyConnector(HandoverProperties props) {
        HandoverProperties.PagerDuty config = props.connectors() == null ? null : props.connectors().pagerduty();
        this.client = config == null || !config.configured() ? null : RestClient.builder()
                .baseUrl(ConnectorSupport.present(config.apiUrl()) ? config.apiUrl() : "https://api.pagerduty.com")
                .defaultHeader("Authorization", "Token token=" + config.token())
                .defaultHeader("Accept", "application/vnd.pagerduty+json;version=2")
                .build();
    }

    @Override
    public String name() {
        return "pagerduty";
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
        try {
            JsonNode users = client.get().uri(b -> b.path("/users").queryParam("query", person.email()).build())
                    .retrieve().body(JsonNode.class);
            if (users == null || users.path("users").isEmpty()) {
                return List.of();
            }
            String userId = users.path("users").get(0).path("id").asText();
            String until = Instant.now().plus(30, ChronoUnit.DAYS).toString();
            JsonNode oncalls = client.get().uri(b -> b.path("/oncalls").queryParam("user_ids[]", userId)
                    .queryParam("until", until).queryParam("limit", 100).build()).retrieve().body(JsonNode.class);
            String since = Instant.now().minus(90, ChronoUnit.DAYS).toString();
            JsonNode incidents = client.get().uri(b -> b.path("/incidents").queryParam("user_ids[]", userId)
                    .queryParam("since", since).queryParam("limit", 100).build()).retrieve().body(JsonNode.class);
            int incidentCount = incidents == null ? 0 : incidents.path("incidents").size();

            Map<String, JsonNode> byPolicy = new LinkedHashMap<>();
            if (oncalls != null) {
                for (JsonNode o : oncalls.path("oncalls")) {
                    byPolicy.putIfAbsent(o.path("escalation_policy").path("summary").asText("On-call"), o);
                }
            }
            List<DiscoveredItem> items = new ArrayList<>();
            byPolicy.forEach((policy, o) -> {
                String schedule = o.path("schedule").path("summary").asText("no schedule");
                items.add(new DiscoveredItem("oncall", "On-call: " + policy + " (level " + o.path("escalation_level").asText("?") + ")",
                        "pagerduty", o.path("escalation_policy").path("html_url").asText(null), incidentCount, false, null,
                        null, true, List.of("On escalation policy '" + policy + "' via schedule '" + schedule
                                + "'. Handled " + incidentCount + " incidents in the last 90 days.")));
            });
            return items;
        } catch (RestClientException e) {
            log.warn("PagerDuty discovery failed: {}", e.getMessage());
            return List.of();
        }
    }
}
