package com.handover.service;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;

import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartFile;

import com.handover.config.HandoverProperties;

/** Stores uploaded recordings on local disk. Swap for S3/GCS by replacing this one class. */
@Component
public class MediaStorage {

    private static final Set<String> ALLOWED = Set.of("webm", "mp4", "mov", "m4a", "mp3", "wav", "ogg");

    private final Path root;

    public MediaStorage(HandoverProperties props) throws IOException {
        this.root = Path.of(props.mediaDir() == null || props.mediaDir().isBlank() ? "./data/media" : props.mediaDir())
                .toAbsolutePath().normalize();
        Files.createDirectories(root);
    }

    /** Saves the file under a random name and returns that name. */
    public String save(MultipartFile file) throws IOException {
        String original = file.getOriginalFilename() == null ? "" : file.getOriginalFilename();
        String ext = original.contains(".") ? original.substring(original.lastIndexOf('.') + 1).toLowerCase(Locale.ROOT) : "webm";
        if (!ALLOWED.contains(ext)) {
            throw new IllegalArgumentException("Only video or audio files can be uploaded (" + String.join(", ", ALLOWED) + ")");
        }
        String name = UUID.randomUUID() + "." + ext;
        try (InputStream in = file.getInputStream()) {
            Files.copy(in, root.resolve(name), StandardCopyOption.REPLACE_EXISTING);
        }
        return name;
    }

    /** Resolves a stored name, refusing anything that would escape the media folder. */
    public Path resolve(String name) {
        Path p = root.resolve(name).normalize();
        if (!p.startsWith(root) || !Files.isRegularFile(p)) {
            throw new NotFoundException("Recording " + name + " not found");
        }
        return p;
    }

    public static String kindFor(String fileName) {
        String n = fileName.toLowerCase(Locale.ROOT);
        return n.endsWith(".m4a") || n.endsWith(".mp3") || n.endsWith(".wav") || n.endsWith(".ogg") ? "audio" : "video";
    }
}
