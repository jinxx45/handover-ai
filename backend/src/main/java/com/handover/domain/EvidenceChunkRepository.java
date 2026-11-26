package com.handover.domain;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

public interface EvidenceChunkRepository extends JpaRepository<EvidenceChunk, Long> {

    List<EvidenceChunk> findByCaseIdOrderByIdAsc(String caseId);
}
