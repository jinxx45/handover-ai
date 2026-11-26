package com.handover.connector;

import java.util.List;

/**
 * An owned item as a connector found it, with the raw evidence text behind it.
 *
 * @param kind              repo | service | doc | ticket_queue | ticket | customer | recurring_task | contact |
 *                          approval | oncall | other
 * @param activity          changes in the lookback window (commits, ticket updates, edits, approvals)
 * @param hasDocs           a runbook/README/doc exists for it
 * @param lastActivityDays  days since the person last touched it, if known
 * @param ownershipShare    the person's share of all changes to it (0..1), if known
 * @param needsReassignment a right or duty (approver, required reviewer, on-call, meeting owner, file owner)
 *                          that stops working when the person's account is closed, so it must get a new owner
 */
public record DiscoveredItem(
        String kind,
        String title,
        String source,
        String url,
        int activity,
        boolean hasDocs,
        Integer lastActivityDays,
        Double ownershipShare,
        boolean needsReassignment,
        List<String> evidence) {

    public DiscoveredItem {
        evidence = evidence == null ? List.of() : List.copyOf(evidence);
    }
}
