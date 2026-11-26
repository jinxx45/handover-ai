package com.handover.web;

import java.nio.file.Path;

import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.http.MediaTypeFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

import com.handover.service.MediaStorage;

/** Serves uploaded recordings. Spring handles range requests, so videos can seek. */
@RestController
public class MediaController {

    private final MediaStorage storage;

    public MediaController(MediaStorage storage) {
        this.storage = storage;
    }

    @GetMapping("/v1/media/{name}")
    public ResponseEntity<Resource> get(@PathVariable String name) {
        Path path = storage.resolve(name);
        Resource resource = new FileSystemResource(path);
        MediaType type = MediaTypeFactory.getMediaType(resource).orElse(MediaType.APPLICATION_OCTET_STREAM);
        return ResponseEntity.ok().contentType(type).body(resource);
    }
}
