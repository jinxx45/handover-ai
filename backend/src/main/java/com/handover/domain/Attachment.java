package com.handover.domain;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.Table;

/** A recording or link attached to an interview answer (turnLabel) or to an owned item. */
@Entity
@Table(name = "attachment", indexes = @Index(columnList = "caseId"))
public class Attachment {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    private String caseId;
    private String itemId;
    private String turnLabel;

    /** link | video | audio */
    private String kind;

    @Column(length = 2000)
    private String url;

    private String title;
    private String fileName;
    private String addedBy;
    private Instant createdAt;

    protected Attachment() {
    }

    public Attachment(String caseId, String itemId, String turnLabel, String kind, String url, String title,
                      String fileName, String addedBy) {
        this.caseId = caseId;
        this.itemId = itemId;
        this.turnLabel = turnLabel;
        this.kind = kind;
        this.url = url;
        this.title = title;
        this.fileName = fileName;
        this.addedBy = addedBy;
        this.createdAt = Instant.now();
    }

    public Long getId() { return id; }
    public String getCaseId() { return caseId; }
    public String getItemId() { return itemId; }
    public String getTurnLabel() { return turnLabel; }
    public String getKind() { return kind; }
    public String getUrl() { return url; }
    public String getTitle() { return title; }
    public String getFileName() { return fileName; }
    public String getAddedBy() { return addedBy; }
    public Instant getCreatedAt() { return createdAt; }
}
