package com.handover.agent;

public class AgentUnavailableException extends RuntimeException {

    public AgentUnavailableException(String message, Throwable cause) {
        super(message, cause);
    }
}
