package com.handover.domain;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

public interface HandoverCaseRepository extends JpaRepository<HandoverCase, String> {

    Optional<HandoverCase> findByEventId(String eventId);

    List<HandoverCase> findAllByOrderByCreatedAtDesc();
}
