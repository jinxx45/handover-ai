package com.handover.connector;

import java.util.List;

/**
 * One work tool. Add a tool by adding a Spring bean that implements this interface;
 * the case service picks up every enabled connector automatically.
 */
public interface WorkConnector {

    String name();

    boolean enabled();

    /** Find what the person owns. Must not throw for "nothing found"; return an empty list. */
    List<DiscoveredItem> discover(PersonRef person);
}
