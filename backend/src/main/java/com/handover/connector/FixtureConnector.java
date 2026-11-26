package com.handover.connector;

import java.io.IOException;
import java.io.InputStream;
import java.util.List;

import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.handover.config.HandoverProperties;

/**
 * Demo data from classpath:demo/{personId}.json. Lets the product run end to end
 * without real GitHub/Jira credentials, which is what you want on stage.
 */
@Component
public class FixtureConnector implements WorkConnector {

    public record FixtureFile(List<DiscoveredItem> items) {
    }

    private final ObjectMapper mapper;
    private final boolean enabled;

    public FixtureConnector(ObjectMapper mapper, HandoverProperties props) {
        this.mapper = mapper;
        this.enabled = props.connectors() == null || props.connectors().fixture() == null
                || props.connectors().fixture().enabled();
    }

    @Override
    public String name() {
        return "fixture";
    }

    @Override
    public boolean enabled() {
        return enabled;
    }

    @Override
    public List<DiscoveredItem> discover(PersonRef person) {
        if (person.personId() == null || !person.personId().matches("[a-zA-Z0-9_-]+")) {
            return List.of();
        }
        ClassPathResource resource = new ClassPathResource("demo/" + person.personId() + ".json");
        if (!resource.exists()) {
            return List.of();
        }
        try (InputStream in = resource.getInputStream()) {
            FixtureFile file = mapper.readValue(in, FixtureFile.class);
            return file.items() == null ? List.of() : file.items();
        } catch (IOException e) {
            throw new IllegalStateException("Could not read demo data for " + person.personId(), e);
        }
    }
}
