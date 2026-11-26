package com.handover.web;

import java.util.List;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import com.handover.connector.WorkConnector;
import com.handover.web.dto.CaseViews;

/** Which work tools are connected, so people can see where the automatic map comes from. */
@RestController
public class ConnectorController {

    private final List<WorkConnector> connectors;

    public ConnectorController(List<WorkConnector> connectors) {
        this.connectors = connectors;
    }

    @GetMapping("/v1/connectors")
    public List<CaseViews.ConnectorView> list() {
        return connectors.stream().map(c -> new CaseViews.ConnectorView(c.name(), c.enabled())).toList();
    }
}
