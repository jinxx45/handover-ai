package com.handover.web.dto;

import java.time.LocalDate;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

/**
 * A "person is leaving" event in CloudEvents shape. Any HR system (Workday, SuccessFactors,
 * BambooHR, a manual form) only has to produce this to start a handover.
 *
 * <pre>
 * {"specversion":"1.0","type":"person.departed","source":"workday","id":"evt-123",
 *  "data":{"personId":"elena","name":"Elena Marsh","email":"elena.marsh@example.com","lastDay":"2026-12-09"}}
 * </pre>
 */
public record DepartureEvent(
        String specversion,
        @NotBlank String type,
        String source,
        @NotBlank String id,
        @NotNull @Valid Data data) {

    public record Data(
            @NotBlank String personId,
            @NotBlank String name,
            String email,
            String role,
            String managerName,
            LocalDate lastDay,
            String exitType,
            String githubLogin) {
    }
}
