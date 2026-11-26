package com.handover.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.Table;

/** A snippet of text from a work tool, tied to an item. Cited in the pack as E1, E2… */
@Entity
@Table(name = "evidence_chunk", indexes = @Index(columnList = "caseId"))
public class EvidenceChunk {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    private String caseId;
    private String label;
    private String itemId;
    private String source;

    @Column(length = 1000)
    private String url;

    @Column(name = "content_text", length = 8000)
    private String text;

    protected EvidenceChunk() {
    }

    public EvidenceChunk(String caseId, String label, String itemId, String source, String url, String text) {
        this.caseId = caseId;
        this.label = label;
        this.itemId = itemId;
        this.source = source;
        this.url = url;
        this.text = text;
    }

    public Long getId() { return id; }
    public String getCaseId() { return caseId; }
    public String getLabel() { return label; }
    public String getItemId() { return itemId; }
    public String getSource() { return source; }
    public String getUrl() { return url; }
    public String getText() { return text; }
}
