package com.handover.service;

import java.io.IOException;
import java.io.InputStream;
import java.util.List;
import java.util.Optional;

import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;

/** Demo people from classpath:demo/people.json, used by the "simulate a resignation" button. */
@Component
public class PeopleDirectory {

    public record DemoPerson(String personId, String name, String email, String role, String managerName,
                             int noticeDays, String exitType) {
    }

    private final List<DemoPerson> people;

    public PeopleDirectory(ObjectMapper mapper) throws IOException {
        ClassPathResource resource = new ClassPathResource("demo/people.json");
        if (!resource.exists()) {
            this.people = List.of();
            return;
        }
        try (InputStream in = resource.getInputStream()) {
            this.people = List.copyOf(mapper.readValue(in, new TypeReference<List<DemoPerson>>() { }));
        }
    }

    public List<DemoPerson> all() {
        return people;
    }

    public Optional<DemoPerson> find(String personId) {
        return people.stream().filter(p -> p.personId().equals(personId)).findFirst();
    }
}
