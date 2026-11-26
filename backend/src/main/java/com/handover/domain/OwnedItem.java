package com.handover.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.Table;

/** Something the departing person owns: a repo, service, customer, recurring duty… */
@Entity
@Table(name = "owned_item", indexes = @Index(columnList = "caseId"))
public class OwnedItem {

    @Id
    private String id;
    private String caseId;
    private String kind;
    private String title;
    private String source;

    @Column(length = 1000)
    private String url;

    private int activity;
    private boolean hasDocs;
    private Integer lastActivityDays;
    private Double ownershipShare;
    private boolean needsReassignment;
    private Double riskScore;

    @Column(length = 500)
    private String riskReason;

    private boolean needsInterview;

    @Enumerated(EnumType.STRING)
    private Coverage coverage = Coverage.NONE;

    private String successor;
    private int sortOrder;

    /** "auto" when a connector found it, "manual" when a person added it. */
    private String origin = "auto";
    private String addedBy;

    /** Someone marked it "not theirs"; hidden everywhere but kept for the audit trail. */
    private boolean dismissed;

    protected OwnedItem() {
    }

    public OwnedItem(String id, String caseId) {
        this.id = id;
        this.caseId = caseId;
    }

    public String getId() { return id; }
    public String getCaseId() { return caseId; }
    public String getKind() { return kind; }
    public void setKind(String kind) { this.kind = kind; }
    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }
    public String getSource() { return source; }
    public void setSource(String source) { this.source = source; }
    public String getUrl() { return url; }
    public void setUrl(String url) { this.url = url; }
    public int getActivity() { return activity; }
    public void setActivity(int activity) { this.activity = activity; }
    public boolean isHasDocs() { return hasDocs; }
    public void setHasDocs(boolean hasDocs) { this.hasDocs = hasDocs; }
    public Integer getLastActivityDays() { return lastActivityDays; }
    public void setLastActivityDays(Integer lastActivityDays) { this.lastActivityDays = lastActivityDays; }
    public Double getOwnershipShare() { return ownershipShare; }
    public void setOwnershipShare(Double ownershipShare) { this.ownershipShare = ownershipShare; }
    public boolean isNeedsReassignment() { return needsReassignment; }
    public void setNeedsReassignment(boolean needsReassignment) { this.needsReassignment = needsReassignment; }
    public Double getRiskScore() { return riskScore; }
    public void setRiskScore(Double riskScore) { this.riskScore = riskScore; }
    public String getRiskReason() { return riskReason; }
    public void setRiskReason(String riskReason) { this.riskReason = riskReason; }
    public boolean isNeedsInterview() { return needsInterview; }
    public void setNeedsInterview(boolean needsInterview) { this.needsInterview = needsInterview; }
    public Coverage getCoverage() { return coverage; }
    public void setCoverage(Coverage coverage) { this.coverage = coverage; }
    public String getSuccessor() { return successor; }
    public void setSuccessor(String successor) { this.successor = successor; }
    public int getSortOrder() { return sortOrder; }
    public String getOrigin() { return origin; }
    public void setOrigin(String origin) { this.origin = origin; }
    public String getAddedBy() { return addedBy; }
    public void setAddedBy(String addedBy) { this.addedBy = addedBy; }
    public boolean isDismissed() { return dismissed; }
    public void setDismissed(boolean dismissed) { this.dismissed = dismissed; }
    public void setSortOrder(int sortOrder) { this.sortOrder = sortOrder; }
}
