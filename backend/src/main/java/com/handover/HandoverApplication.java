package com.handover;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

@SpringBootApplication
@ConfigurationPropertiesScan
public class HandoverApplication {

    public static void main(String[] args) {
        SpringApplication.run(HandoverApplication.class, args);
    }
}
