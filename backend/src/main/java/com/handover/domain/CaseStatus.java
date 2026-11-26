package com.handover.domain;

/** Lifecycle of a handover case. */
public enum CaseStatus {
    /** Connectors are discovering what the person owns. */
    MAPPING,
    /** The agent is interviewing the departing employee. */
    INTERVIEWING,
    /** The pack is drafted and waits for leaver + manager review. */
    REVIEW,
    /** The pack is approved and the successor can use it. */
    PUBLISHED,
    /** Something failed (usually the agent was unreachable); see errorMessage. */
    FAILED
}
