package com.handover.web;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.handover.service.CaseService;
import com.handover.web.dto.CaseViews;
import com.handover.web.dto.DepartureEvent;

import jakarta.validation.Valid;

/** Intake for HR-system events. Point a Workday (or any HRIS) outbound webhook here. */
@RestController
public class EventController {

    private final CaseService service;

    public EventController(CaseService service) {
        this.service = service;
    }

    @PostMapping("/v1/events")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public CaseViews.CaseDetail receive(@Valid @RequestBody DepartureEvent event) {
        return service.createFromEvent(event);
    }
}
