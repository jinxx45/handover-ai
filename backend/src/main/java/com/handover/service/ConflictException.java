package com.handover.service;

/** The request is valid but not in the case's current state (e.g. answering after the pack is drafted). */
public class ConflictException extends RuntimeException {
    public ConflictException(String message) {
        super(message);
    }
}
