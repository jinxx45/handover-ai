package com.handover.domain;

import java.time.Instant;
import java.time.LocalDate;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

/** One departing person and everything needed to hand their work over. */
@Entity
@Table(name = "handover_case")
public class HandoverCase {

    @Id
    private String id;

    /** Id of the HR event that created the case; makes event intake idempotent. */
    @Column(unique = true)
    private String eventId;

    private String eventSource;
    private String personId;
    private String personName;
    private String email;
    private String role;
    private String managerName;
    private LocalDate lastDay;
    private String exitType;

    @Enumerated(EnumType.STRING)
    private CaseStatus status;

    private String agentRunId;

    /** Current interview question from the agent, as JSON; null when not interviewing. */
    @Column(length = 8000)
    private String currentQuestionJson;

    /** Drafted or published knowledge pack, as JSON. */
    @Column(length = 200000)
    private String packJson;

    /** Skills the backfill needs, as JSON from the agent; regenerated on request. */
    @Column(length = 100000)
    private String backfillJson;

    /** Onboarding kit for the backfill, as JSON from the agent. */
    @Column(length = 100000)
    private String onboardingJson;

    private String approvedBy;
    private Instant approvedAt;

    @Column(length = 1000)
    private String errorMessage;

    private Instant createdAt;
    private Instant updatedAt;

    protected HandoverCase() {
    }

    public HandoverCase(String id) {
        this.id = id;
        this.status = CaseStatus.MAPPING;
    }

    @PrePersist
    void onCreate() {
        createdAt = Instant.now();
        updatedAt = createdAt;
    }

    @PreUpdate
    void onUpdate() {
        updatedAt = Instant.now();
    }

    public String getId() { return id; }
    public String getEventId() { return eventId; }
    public void setEventId(String eventId) { this.eventId = eventId; }
    public String getEventSource() { return eventSource; }
    public void setEventSource(String eventSource) { this.eventSource = eventSource; }
    public String getPersonId() { return personId; }
    public void setPersonId(String personId) { this.personId = personId; }
    public String getPersonName() { return personName; }
    public void setPersonName(String personName) { this.personName = personName; }
    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }
    public String getRole() { return role; }
    public void setRole(String role) { this.role = role; }
    public String getManagerName() { return managerName; }
    public void setManagerName(String managerName) { this.managerName = managerName; }
    public LocalDate getLastDay() { return lastDay; }
    public void setLastDay(LocalDate lastDay) { this.lastDay = lastDay; }
    public String getExitType() { return exitType; }
    public void setExitType(String exitType) { this.exitType = exitType; }
    public CaseStatus getStatus() { return status; }
    public void setStatus(CaseStatus status) { this.status = status; }
    public String getAgentRunId() { return agentRunId; }
    public void setAgentRunId(String agentRunId) { this.agentRunId = agentRunId; }
    public String getCurrentQuestionJson() { return currentQuestionJson; }
    public void setCurrentQuestionJson(String currentQuestionJson) { this.currentQuestionJson = currentQuestionJson; }
    public String getPackJson() { return packJson; }
    public void setPackJson(String packJson) { this.packJson = packJson; }
    public String getBackfillJson() { return backfillJson; }
    public void setBackfillJson(String backfillJson) { this.backfillJson = backfillJson; }
    public String getOnboardingJson() { return onboardingJson; }
    public void setOnboardingJson(String onboardingJson) { this.onboardingJson = onboardingJson; }
    public String getApprovedBy() { return approvedBy; }
    public void setApprovedBy(String approvedBy) { this.approvedBy = approvedBy; }
    public Instant getApprovedAt() { return approvedAt; }
    public void setApprovedAt(Instant approvedAt) { this.approvedAt = approvedAt; }
    public String getErrorMessage() { return errorMessage; }
    public void setErrorMessage(String errorMessage) { this.errorMessage = errorMessage; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
}
