package com.handover.domain;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.Table;

/** A successor question asked against a published pack. Uncovered ones show the manager what is missing. */
@Entity
@Table(name = "pack_question", indexes = @Index(columnList = "caseId"))
public class PackQuestion {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    private String caseId;
    private String askedBy;

    @Column(length = 2000)
    private String question;

    @Column(length = 8000)
    private String answer;

    @Column(length = 1000)
    private String citations;

    private boolean covered;
    private Instant createdAt;

    protected PackQuestion() {
    }

    public PackQuestion(String caseId, String askedBy, String question, String answer, String citations, boolean covered) {
        this.caseId = caseId;
        this.askedBy = askedBy;
        this.question = question;
        this.answer = answer;
        this.citations = citations;
        this.covered = covered;
        this.createdAt = Instant.now();
    }

    public Long getId() { return id; }
    public String getCaseId() { return caseId; }
    public String getAskedBy() { return askedBy; }
    public String getQuestion() { return question; }
    public String getAnswer() { return answer; }
    public String getCitations() { return citations; }
    public boolean isCovered() { return covered; }
    public Instant getCreatedAt() { return createdAt; }
}
