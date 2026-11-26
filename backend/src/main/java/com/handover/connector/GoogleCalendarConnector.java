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
 * Recurring meetings the person organizes. A recurring meeting is usually a recurring duty (a sync, a review, a
 * release sign-off) and names the people who depend on it. The meeting itself must get a new organizer.
 */
@Component
public class GoogleCalendarConnector implements WorkConnector {

    private static final Logger log = LoggerFactory.getLogger(GoogleCalendarConnector.class);
    private static final int MAX_MEETINGS = 6;

    private final RestClient client;

    public GoogleCalendarConnector(HandoverProperties props) {
        HandoverProperties.Google config = props.connectors() == null ? null : props.connectors().google();
        this.client = config == null || !config.configured() || !config.calendarEnabled() ? null : RestClient.builder()
                .baseUrl("https://www.googleapis.com/calendar/v3")
                .defaultHeader("Authorization", "Bearer " + config.accessToken())
                .build();
    }

    @Override
    public String name() {
        return "google-calendar";
    }

    @Override
    public boolean enabled() {
        return client != null;
    }

    @Override
    public List<DiscoveredItem> discover(PersonRef person) {
        String email = person.email();
        if (!ConnectorSupport.present(email)) {
            return List.of();
        }
        String timeMin = Instant.now().minus(90, ChronoUnit.DAYS).toString();
        try {
            JsonNode result = client.get()
                    .uri(b -> b.path("/calendars/{calendarId}/events").queryParam("timeMin", timeMin)
                            .queryParam("maxResults", 250).queryParam("singleEvents", false).build(email))
                    .retrieve()
                    .body(JsonNode.class);
            List<DiscoveredItem> items = new ArrayList<>();
            if (result == null) {
                return items;
            }
            for (JsonNode event : result.path("items")) {
                boolean recurring = event.path("recurrence").isArray() && !event.path("recurrence").isEmpty();
                boolean organizer = email.equalsIgnoreCase(event.path("organizer").path("email").asText(""));
                if (!recurring || !organizer || "cancelled".equals(event.path("status").asText())) {
                    continue;
                }
                int attendees = event.path("attendees").size();
                List<String> names = new ArrayList<>();
                event.path("attendees").forEach(a -> {
                    if (names.size() < 8 && !email.equalsIgnoreCase(a.path("email").asText())) {
                        names.add(a.path("displayName").asText(a.path("email").asText()));
                    }
                });
                List<String> evidence = List.of(
                        "Recurring meeting '" + event.path("summary").asText() + "' organized by this person ("
                                + event.path("recurrence").get(0).asText() + ") with " + attendees + " attendees.",
                        "Attendees include: " + String.join(", ", names));
                items.add(new DiscoveredItem("recurring_task", "Runs: " + event.path("summary").asText("recurring meeting"),
                        "calendar", event.path("htmlLink").asText(null), attendees, false, null, null, true, evidence));
                if (items.size() >= MAX_MEETINGS) {
                    break;
                }
            }
            return items;
        } catch (RestClientException e) {
            log.warn("Google Calendar discovery failed: {}", e.getMessage());
            return List.of();
        }
    }
}
