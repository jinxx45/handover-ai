package com.handover.web;

import java.time.LocalDate;
import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.handover.service.CaseService;
import com.handover.service.NotFoundException;
import com.handover.service.PeopleDirectory;
import com.handover.web.dto.CaseViews;
import com.handover.web.dto.DepartureEvent;

/** Demo helpers: list seeded people and fire a "person.departed" event as if it came from Workday. */
@RestController
@RequestMapping("/v1/demo")
public class DemoController {

    private final PeopleDirectory people;
    private final CaseService service;

    public DemoController(PeopleDirectory people, CaseService service) {
        this.people = people;
        this.service = service;
    }

    @GetMapping("/people")
    public List<PeopleDirectory.DemoPerson> people() {
        return people.all();
    }

    @PostMapping("/people/{personId}/depart")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public CaseViews.CaseDetail depart(@PathVariable String personId) {
        PeopleDirectory.DemoPerson p = people.find(personId)
                .orElseThrow(() -> new NotFoundException("Demo person " + personId + " not found"));
        DepartureEvent event = new DepartureEvent("1.0", CaseService.DEPARTED_EVENT, "workday",
                "demo-" + personId + "-" + System.currentTimeMillis(),
                new DepartureEvent.Data(p.personId(), p.name(), p.email(), p.role(), p.managerName(),
                        LocalDate.now().plusDays(p.noticeDays()), p.exitType(), null));
        return service.createFromEvent(event);
    }
}
