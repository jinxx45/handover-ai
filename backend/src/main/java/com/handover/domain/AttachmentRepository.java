package com.handover.domain;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

public interface AttachmentRepository extends JpaRepository<Attachment, Long> {

    List<Attachment> findByCaseIdOrderByIdAsc(String caseId);

    Optional<Attachment> findByIdAndCaseId(Long id, String caseId);
}
