(() => {
    const PREVIEW_MAX_DIMENSION = 2048;
    const PREVIEW_SIZE_THRESHOLD = 5 * 1024 * 1024;
    const PREVIEW_JPEG_QUALITY = 0.82;
    const OUTPUT_JPEG_QUALITY = 0.92;
    const PROCESS_BATCH_SIZE = 2;

    const elements = {
        photoInput: document.getElementById("photoInput"),
        photoUpload: document.getElementById("photoUpload"),
        photoUploadState: document.getElementById("photoUploadState"),
        photoCount: document.getElementById("photoCount"),
        watermarkInput: document.getElementById("watermarkInput"),
        watermarkUpload: document.getElementById("watermarkUpload"),
        watermarkUploadState: document.getElementById("watermarkUploadState"),
        watermarkPreview: document.getElementById("watermarkPreview"),
        watermarkPreviewContainer: document.getElementById("watermarkPreviewContainer"),
        watermarkInfo: document.getElementById("watermarkInfo"),
        previewImage: document.getElementById("previewImage"),
        previewMeta: document.getElementById("previewMeta"),
        previewBadge: document.getElementById("previewBadge"),
        thumbnailContainer: document.getElementById("thumbnailContainer"),
        thumbnailSummary: document.getElementById("thumbnailSummary"),
        noImagesMessage: document.getElementById("noImagesMessage"),
        applyWatermarkBtn: document.getElementById("applyWatermarkBtn"),
        downloadAllBtn: document.getElementById("downloadAllBtn"),
        processedCount: document.getElementById("processedCount"),
        appStatusText: document.getElementById("appStatusText"),
        loading: document.getElementById("loading"),
        loadingText: document.querySelector("#loading p"),
        watermarkModeInputs: Array.from(document.querySelectorAll('input[name="watermarkMode"]')),
        backgroundRemovalGroup: document.getElementById("backgroundRemovalGroup"),
        removeLightBackgroundSwitch: document.getElementById("removeLightBackgroundSwitch"),
        manualColorGroup: document.getElementById("manualColorGroup"),
        watermarkColor: document.getElementById("watermarkColor"),
        colorButtons: Array.from(document.querySelectorAll(".color-btn")),
        opacityRange: document.getElementById("opacityRange"),
        opacityValue: document.getElementById("opacityValue"),
        sizeRange: document.getElementById("sizeRange"),
        sizeValue: document.getElementById("sizeValue"),
        marginRange: document.getElementById("marginRange"),
        marginValue: document.getElementById("marginValue")
    };

    const state = {
        photos: [],
        processedDownloads: [],
        currentIndex: 0,
        watermark: null,
        isProcessing: false,
        previewRenderId: 0
    };

    function nextFrame() {
        return new Promise(resolve => requestAnimationFrame(resolve));
    }

    function loadImage(src) {
        return new Promise((resolve, reject) => {
            const image = new Image();
            image.onload = () => resolve(image);
            image.onerror = () => reject(new Error(`Failed to load image: ${src}`));
            image.src = src;
        });
    }

    function readFileAsDataURL(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = event => resolve(event.target.result);
            reader.onerror = () => reject(new Error(`Failed to read file: ${file.name}`));
            reader.readAsDataURL(file);
        });
    }

    function scaleDimensions(width, height, maxDimension) {
        if (width <= maxDimension && height <= maxDimension) {
            return { width, height };
        }

        if (width >= height) {
            return {
                width: maxDimension,
                height: Math.round((height * maxDimension) / width)
            };
        }

        return {
            width: Math.round((width * maxDimension) / height),
            height: maxDimension
        };
    }

    function createCanvas(width, height) {
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        return canvas;
    }

    function canvasToDataURL(canvas, type, quality) {
        return canvas.toDataURL(type, quality);
    }

    function canvasToBlob(canvas, type, quality) {
        return new Promise(resolve => {
            canvas.toBlob(blob => {
                if (blob) {
                    resolve(blob);
                    return;
                }

                resolve(dataUrlToBlob(canvas.toDataURL(type, quality)));
            }, type, quality);
        });
    }

    function dataUrlToBlob(dataUrl) {
        const [header, payload] = dataUrl.split(",");
        const mimeMatch = header.match(/data:(.*?);base64/);
        const mimeType = mimeMatch ? mimeMatch[1] : "application/octet-stream";
        const binary = atob(payload);
        const bytes = new Uint8Array(binary.length);

        for (let index = 0; index < binary.length; index += 1) {
            bytes[index] = binary.charCodeAt(index);
        }

        return new Blob([bytes], { type: mimeType });
    }

    function clampRectangle(x, y, width, height, maxWidth, maxHeight) {
        const clampedX = Math.max(0, Math.min(Math.round(x), maxWidth));
        const clampedY = Math.max(0, Math.min(Math.round(y), maxHeight));
        const clampedWidth = Math.max(1, Math.min(Math.round(width), maxWidth - clampedX));
        const clampedHeight = Math.max(1, Math.min(Math.round(height), maxHeight - clampedY));

        return {
            x: clampedX,
            y: clampedY,
            width: clampedWidth,
            height: clampedHeight
        };
    }

    function getContrastColor(context, x, y, width, height) {
        const bounds = clampRectangle(x, y, width, height, context.canvas.width, context.canvas.height);
        const imageData = context.getImageData(bounds.x, bounds.y, bounds.width, bounds.height);
        const pixels = imageData.data;

        let brightnessSum = 0;
        let pixelCount = 0;

        for (let index = 0; index < pixels.length; index += 4) {
            const brightness =
                (0.299 * pixels[index]) +
                (0.587 * pixels[index + 1]) +
                (0.114 * pixels[index + 2]);

            brightnessSum += brightness;
            pixelCount += 1;
        }

        if (!pixelCount) {
            return "#FFFFFF";
        }

        return brightnessSum / pixelCount > 128 ? "#000000" : "#FFFFFF";
    }

    function getSettings() {
        return {
            opacity: Number.parseInt(elements.opacityRange.value, 10) / 100,
            size: Number.parseInt(elements.sizeRange.value, 10) / 100,
            margin: Number.parseInt(elements.marginRange.value, 10)
        };
    }

    function getWatermarkMode() {
        const selectedMode = elements.watermarkModeInputs.find(input => input.checked);
        return selectedMode ? selectedMode.value : "original";
    }

    function getOutputType(photo) {
        return photo.mimeType === "image/png" ? "image/png" : "image/jpeg";
    }

    function buildDownloadName(originalName, type) {
        const dotIndex = originalName.lastIndexOf(".");
        const baseName = dotIndex === -1 ? originalName : originalName.slice(0, dotIndex);
        const originalExtension = dotIndex === -1 ? "" : originalName.slice(dotIndex);

        if (type === "image/png") {
            return `${baseName}_watermarked.png`;
        }

        if (/\.jpe?g$/i.test(originalExtension)) {
            return `${baseName}_watermarked${originalExtension}`;
        }

        return `${baseName}_watermarked.jpg`;
    }

    function formatDimensions(width, height) {
        if (!width || !height) {
            return "尺寸未知";
        }

        return `${width} × ${height}px`;
    }

    function formatCountLabel(count, singularLabel, pluralLabel = singularLabel) {
        return `${count} ${count === 1 ? singularLabel : pluralLabel}`;
    }

    function updateSliderLabels() {
        elements.opacityValue.textContent = `${elements.opacityRange.value}%`;
        elements.sizeValue.textContent = `${elements.sizeRange.value}%`;
        elements.marginValue.textContent = `${elements.marginRange.value}px`;
    }

    function syncColorModeControls() {
        const mode = getWatermarkMode();
        elements.manualColorGroup.style.display = mode === "manual" ? "grid" : "none";

        if (elements.backgroundRemovalGroup) {
            elements.backgroundRemovalGroup.style.display = mode === "original" ? "grid" : "none";
        }
    }

    function updateActiveColorButton() {
        elements.colorButtons.forEach(button => {
            const isActive = button.dataset.color.toLowerCase() === elements.watermarkColor.value.toLowerCase();
            button.classList.toggle("is-active", isActive);
            button.setAttribute("aria-pressed", String(isActive));
        });
    }

    function createWatermarkCanvas() {
        const watermarkCanvas = createCanvas(state.watermark.width, state.watermark.height);
        const watermarkContext = watermarkCanvas.getContext("2d");
        watermarkContext.imageSmoothingEnabled = true;
        watermarkContext.imageSmoothingQuality = "high";
        watermarkContext.drawImage(state.watermark.image, 0, 0, watermarkCanvas.width, watermarkCanvas.height);
        return { canvas: watermarkCanvas, context: watermarkContext };
    }

    function removeLightBackground(watermarkCanvas, watermarkContext) {
        const imageData = watermarkContext.getImageData(0, 0, watermarkCanvas.width, watermarkCanvas.height);
        const pixels = imageData.data;
        const whiteThreshold = 242;
        const softThreshold = 210;

        for (let index = 0; index < pixels.length; index += 4) {
            const red = pixels[index];
            const green = pixels[index + 1];
            const blue = pixels[index + 2];
            const alpha = pixels[index + 3];
            const minChannel = Math.min(red, green, blue);
            const maxChannel = Math.max(red, green, blue);
            const brightness = (red + green + blue) / 3;
            const saturation = maxChannel - minChannel;

            if (alpha === 0 || saturation > 32 || brightness < softThreshold) {
                continue;
            }

            if (brightness >= whiteThreshold) {
                pixels[index + 3] = 0;
                continue;
            }

            const fade = (brightness - softThreshold) / (whiteThreshold - softThreshold);
            pixels[index + 3] = Math.round(alpha * (1 - fade));
        }

        watermarkContext.putImageData(imageData, 0, 0);
    }

    function prepareWatermarkCanvas(baseContext, x, y, width, height) {
        const mode = getWatermarkMode();
        const { canvas, context } = createWatermarkCanvas();

        if (mode === "original") {
            if (elements.removeLightBackgroundSwitch && elements.removeLightBackgroundSwitch.checked) {
                removeLightBackground(canvas, context);
            }

            return canvas;
        }

        context.globalCompositeOperation = "source-in";
        context.fillStyle = mode === "auto"
            ? getContrastColor(baseContext, x, y, width, height)
            : elements.watermarkColor.value;
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.globalCompositeOperation = "source-over";

        return canvas;
    }

    function updateEmptyState() {
        elements.noImagesMessage.style.display = state.photos.length ? "none" : "grid";
    }

    function updatePreviewMeta() {
        const currentPhoto = state.photos[state.currentIndex];

        if (!currentPhoto) {
            elements.previewMeta.textContent = "当前还没有可预览的作品";
            elements.previewBadge.textContent = "未选择图片";
            return;
        }

        const originalSize = formatDimensions(currentPhoto.originalWidth, currentPhoto.originalHeight);
        const previewSize = formatDimensions(currentPhoto.previewWidth, currentPhoto.previewHeight);
        const sizeText = currentPhoto.isPreviewCompressed
            ? `原图 ${originalSize} · 预览 ${previewSize}`
            : `原图 ${originalSize}`;

        elements.previewMeta.textContent = `${currentPhoto.name} · ${sizeText}`;
        elements.previewBadge.textContent = `${state.currentIndex + 1} / ${state.photos.length}`;
    }

    function updateStatusText() {
        const processedCount = state.processedDownloads.filter(Boolean).length;

        if (state.isProcessing) {
            elements.appStatusText.textContent = elements.loadingText.textContent;
            return;
        }

        if (!state.photos.length && !state.watermark) {
            elements.appStatusText.textContent = "等待上传作品与水印";
            return;
        }

        if (state.photos.length && !state.watermark) {
            elements.appStatusText.textContent = `已载入 ${formatCountLabel(state.photos.length, "张作品")}，等待水印`;
            return;
        }

        if (!state.photos.length && state.watermark) {
            elements.appStatusText.textContent = "水印已就绪，等待上传作品";
            return;
        }

        if (processedCount) {
            elements.appStatusText.textContent = `已生成 ${formatCountLabel(processedCount, "张成品")}，可以下载`;
            return;
        }

        elements.appStatusText.textContent = `准备完成，可处理 ${formatCountLabel(state.photos.length, "张作品")}`;
    }

    function updateCounts() {
        const processedCount = state.processedDownloads.filter(Boolean).length;
        elements.photoCount.textContent = String(state.photos.length);
        elements.processedCount.textContent = String(processedCount);
        elements.photoUploadState.textContent = state.photos.length ? `${state.photos.length} 张` : "未选择";
        elements.watermarkUploadState.textContent = state.watermark ? "已就绪" : "未选择";
        elements.thumbnailSummary.textContent = state.photos.length ? `${state.photos.length} 张图片` : "暂无图片";
    }

    function syncUiMeta() {
        updateCounts();
        updatePreviewMeta();
        updateStatusText();
    }

    function updateButtonState() {
        elements.applyWatermarkBtn.disabled = !state.photos.length || !state.watermark || state.isProcessing;
        elements.downloadAllBtn.disabled = !state.processedDownloads.some(Boolean) || state.isProcessing;
    }

    function setLoadingState(isVisible, message) {
        elements.loading.style.display = isVisible ? "flex" : "none";

        if (message && elements.loadingText) {
            elements.loadingText.textContent = message;
        }

        updateStatusText();
    }

    function revokePhotoUrls(photo) {
        if (photo && photo.originalUrl && photo.originalUrl.startsWith("blob:")) {
            URL.revokeObjectURL(photo.originalUrl);
        }
    }

    function revokeProcessedDownloads() {
        state.processedDownloads.forEach(item => {
            if (item && item.url) {
                URL.revokeObjectURL(item.url);
            }
        });
        state.processedDownloads = [];
    }

    function clearPhotos() {
        state.photos.forEach(revokePhotoUrls);
        state.photos = [];
        state.currentIndex = 0;
        elements.thumbnailContainer.innerHTML = "";
        elements.previewImage.removeAttribute("src");
        elements.previewImage.style.display = "none";
        syncUiMeta();
    }

    function invalidateProcessedDownloads() {
        revokeProcessedDownloads();
        syncUiMeta();
        updateButtonState();
    }

    function refreshActiveThumbnail() {
        const thumbnails = elements.thumbnailContainer.querySelectorAll(".thumbnail");
        thumbnails.forEach((thumbnail, index) => {
            thumbnail.classList.toggle("active", index === state.currentIndex);
        });
    }

    function createWatermarkedCanvas(baseImage) {
        const canvas = createCanvas(
            baseImage.naturalWidth || baseImage.width,
            baseImage.naturalHeight || baseImage.height
        );
        const context = canvas.getContext("2d");
        const settings = getSettings();

        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = "high";
        context.drawImage(baseImage, 0, 0, canvas.width, canvas.height);

        if (!state.watermark) {
            return canvas;
        }

        const watermarkAspectRatio = state.watermark.width / state.watermark.height;
        const watermarkWidth = Math.max(1, canvas.width * settings.size);
        const watermarkHeight = Math.max(1, watermarkWidth / watermarkAspectRatio);
        const watermarkX = (canvas.width - watermarkWidth) / 2;
        const watermarkY = Math.max(settings.margin, canvas.height - watermarkHeight - settings.margin);

        const watermarkCanvas = prepareWatermarkCanvas(
            context,
            watermarkX,
            watermarkY,
            watermarkWidth,
            watermarkHeight
        );

        context.globalAlpha = settings.opacity;
        context.drawImage(watermarkCanvas, watermarkX, watermarkY, watermarkWidth, watermarkHeight);
        context.globalAlpha = 1;

        return canvas;
    }

    async function createPreviewSource(originalUrl, file) {
        const image = await loadImage(originalUrl);
        const originalWidth = image.naturalWidth || image.width;
        const originalHeight = image.naturalHeight || image.height;
        const targetSize = scaleDimensions(originalWidth, originalHeight, PREVIEW_MAX_DIMENSION);

        const needsCompression =
            file.size > PREVIEW_SIZE_THRESHOLD ||
            targetSize.width !== originalWidth ||
            targetSize.height !== originalHeight;

        if (!needsCompression) {
            return {
                src: originalUrl,
                width: originalWidth,
                height: originalHeight,
                originalWidth,
                originalHeight,
                isCompressed: false
            };
        }

        const canvas = createCanvas(targetSize.width, targetSize.height);
        const context = canvas.getContext("2d");
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = "high";
        context.drawImage(image, 0, 0, canvas.width, canvas.height);

        return {
            src: canvasToDataURL(canvas, "image/jpeg", PREVIEW_JPEG_QUALITY),
            width: targetSize.width,
            height: targetSize.height,
            originalWidth,
            originalHeight,
            isCompressed: true
        };
    }

    async function renderCurrentPreview() {
        const photo = state.photos[state.currentIndex];

        if (!photo) {
            elements.previewImage.removeAttribute("src");
            elements.previewImage.style.display = "none";
            updatePreviewMeta();
            return;
        }

        const renderId = state.previewRenderId + 1;
        state.previewRenderId = renderId;

        if (!state.watermark) {
            elements.previewImage.src = photo.previewUrl;
            elements.previewImage.style.display = "block";
            updatePreviewMeta();
            return;
        }

        const baseImage = await loadImage(photo.previewUrl);
        const previewCanvas = createWatermarkedCanvas(baseImage);

        if (renderId !== state.previewRenderId) {
            return;
        }

        elements.previewImage.src = previewCanvas.toDataURL("image/jpeg", PREVIEW_JPEG_QUALITY);
        elements.previewImage.style.display = "block";
        updatePreviewMeta();
    }

    function createThumbnail(photo, index) {
        const thumbnail = document.createElement("button");
        thumbnail.type = "button";
        thumbnail.className = "thumbnail";
        thumbnail.title = photo.name;
        thumbnail.setAttribute("aria-label", `预览 ${photo.name}`);

        const image = document.createElement("img");
        image.src = photo.previewUrl;
        image.alt = photo.name;

        const label = document.createElement("span");
        label.className = "thumbnail-label";
        label.textContent = photo.name;

        thumbnail.append(image, label);
        thumbnail.addEventListener("click", () => {
            state.currentIndex = index;
            refreshActiveThumbnail();
            syncUiMeta();
            renderCurrentPreview().catch(console.error);
        });

        elements.thumbnailContainer.appendChild(thumbnail);
    }

    async function handlePhotoFiles(fileList) {
        const imageFiles = Array.from(fileList).filter(file => file.type.startsWith("image/"));

        if (!imageFiles.length) {
            return;
        }

        state.previewRenderId += 1;
        clearPhotos();
        invalidateProcessedDownloads();
        updateEmptyState();

        for (const file of imageFiles) {
            const originalUrl = URL.createObjectURL(file);

            try {
                const preview = await createPreviewSource(originalUrl, file);
                const photo = {
                    name: file.name,
                    mimeType: file.type || "image/jpeg",
                    originalUrl,
                    previewUrl: preview.src,
                    originalWidth: preview.originalWidth,
                    originalHeight: preview.originalHeight,
                    previewWidth: preview.width,
                    previewHeight: preview.height,
                    isPreviewCompressed: preview.isCompressed
                };

                state.photos.push(photo);
                createThumbnail(photo, state.photos.length - 1);
                syncUiMeta();
                await nextFrame();
            } catch (error) {
                revokePhotoUrls({ originalUrl });
                console.error(error);
            }
        }

        state.currentIndex = 0;
        refreshActiveThumbnail();
        updateEmptyState();
        syncUiMeta();
        updateButtonState();
        await renderCurrentPreview();
    }

    async function handleWatermarkFile(file) {
        if (!file || file.type !== "image/png") {
            alert("请上传 PNG 格式的水印图片。");
            return;
        }

        invalidateProcessedDownloads();

        try {
            const dataUrl = await readFileAsDataURL(file);
            const image = await loadImage(dataUrl);
            const width = image.naturalWidth || image.width;
            const height = image.naturalHeight || image.height;

            state.watermark = {
                file,
                dataUrl,
                image,
                width,
                height
            };

            elements.watermarkPreview.src = dataUrl;
            elements.watermarkPreview.style.display = "block";
            elements.watermarkPreviewContainer.style.display = "block";
            elements.watermarkInfo.textContent = `${file.name} · ${width} × ${height}px`;

            syncUiMeta();
            updateButtonState();

            if (state.photos.length) {
                await renderCurrentPreview();
            }
        } catch (error) {
            console.error(error);
        }
    }

    async function createProcessedDownload(photo) {
        const baseImage = await loadImage(photo.originalUrl);
        const canvas = createWatermarkedCanvas(baseImage);
        const outputType = getOutputType(photo);
        const quality = outputType === "image/png" ? undefined : OUTPUT_JPEG_QUALITY;
        const blob = await canvasToBlob(canvas, outputType, quality);
        const url = URL.createObjectURL(blob);

        return {
            url,
            type: blob.type || outputType,
            name: buildDownloadName(photo.name, outputType),
            width: canvas.width,
            height: canvas.height
        };
    }

    async function applyWatermarkToAllPhotos() {
        if (!state.photos.length || !state.watermark || state.isProcessing) {
            return;
        }

        state.isProcessing = true;
        revokeProcessedDownloads();
        state.processedDownloads = new Array(state.photos.length);
        updateButtonState();
        setLoadingState(true, "正在处理图片...");

        try {
            for (let startIndex = 0; startIndex < state.photos.length; startIndex += PROCESS_BATCH_SIZE) {
                const batch = state.photos.slice(startIndex, startIndex + PROCESS_BATCH_SIZE);

                for (let offset = 0; offset < batch.length; offset += 1) {
                    const photoIndex = startIndex + offset;
                    const photo = batch[offset];
                    const progressText = `正在处理图片 ${photoIndex + 1} / ${state.photos.length}`;
                    elements.loadingText.textContent = progressText;
                    updateStatusText();
                    state.processedDownloads[photoIndex] = await createProcessedDownload(photo);
                    syncUiMeta();
                }

                await nextFrame();
            }
        } catch (error) {
            console.error(error);
        } finally {
            state.isProcessing = false;
            setLoadingState(false, "正在处理图片...");
            syncUiMeta();
            updateButtonState();
            await renderCurrentPreview();
        }
    }

    function downloadAllProcessedImages() {
        const downloads = state.processedDownloads.filter(Boolean);

        if (!downloads.length) {
            return;
        }

        downloads.forEach((item, index) => {
            window.setTimeout(() => {
                const link = document.createElement("a");
                link.href = item.url;
                link.download = item.name;
                link.style.display = "none";
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            }, index * 120);
        });
    }

    function handleSettingsChanged() {
        invalidateProcessedDownloads();
        syncUiMeta();

        if (state.photos.length) {
            renderCurrentPreview().catch(console.error);
        }
    }

    function initDragAndDrop(target, onFilesDropped, allowMultiple) {
        target.addEventListener("dragover", event => {
            event.preventDefault();
            target.classList.add("highlight");
        });

        target.addEventListener("dragleave", () => {
            target.classList.remove("highlight");
        });

        target.addEventListener("drop", event => {
            event.preventDefault();
            target.classList.remove("highlight");

            if (!event.dataTransfer || !event.dataTransfer.files.length) {
                return;
            }

            if (allowMultiple) {
                onFilesDropped(event.dataTransfer.files);
            } else {
                onFilesDropped(event.dataTransfer.files[0]);
            }
        });
    }

    function bindUploadShortcut(target, input) {
        target.addEventListener("click", () => input.click());
        target.addEventListener("keydown", event => {
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                input.click();
            }
        });
    }

    function bindEvents() {
        bindUploadShortcut(elements.photoUpload, elements.photoInput);
        elements.photoInput.addEventListener("change", async event => {
            if (event.target.files.length) {
                await handlePhotoFiles(event.target.files);
                event.target.value = "";
            }
        });

        bindUploadShortcut(elements.watermarkUpload, elements.watermarkInput);
        elements.watermarkInput.addEventListener("change", async event => {
            if (event.target.files.length) {
                await handleWatermarkFile(event.target.files[0]);
                event.target.value = "";
            }
        });

        elements.applyWatermarkBtn.addEventListener("click", () => {
            applyWatermarkToAllPhotos().catch(console.error);
        });
        elements.downloadAllBtn.addEventListener("click", downloadAllProcessedImages);

        elements.opacityRange.addEventListener("input", () => {
            updateSliderLabels();
            handleSettingsChanged();
        });
        elements.sizeRange.addEventListener("input", () => {
            updateSliderLabels();
            handleSettingsChanged();
        });
        elements.marginRange.addEventListener("input", () => {
            updateSliderLabels();
            handleSettingsChanged();
        });

        elements.watermarkModeInputs.forEach(input => {
            input.addEventListener("change", () => {
                syncColorModeControls();
                handleSettingsChanged();
            });
        });

        elements.removeLightBackgroundSwitch.addEventListener("change", handleSettingsChanged);

        elements.watermarkColor.addEventListener("change", () => {
            updateActiveColorButton();
            handleSettingsChanged();
        });

        elements.colorButtons.forEach(button => {
            button.addEventListener("click", () => {
                elements.watermarkColor.value = button.dataset.color;
                updateActiveColorButton();
                handleSettingsChanged();
            });
        });

        initDragAndDrop(elements.photoUpload, files => {
            handlePhotoFiles(files).catch(console.error);
        }, true);

        initDragAndDrop(elements.watermarkUpload, file => {
            handleWatermarkFile(file).catch(console.error);
        }, false);

        window.addEventListener("beforeunload", () => {
            state.photos.forEach(revokePhotoUrls);
            revokeProcessedDownloads();
        });
    }

    function init() {
        updateSliderLabels();
        syncColorModeControls();
        updateActiveColorButton();
        updateEmptyState();
        syncUiMeta();
        setLoadingState(false, "正在处理图片...");
        bindEvents();
        updateButtonState();

        window.watermarkApp = {
            state,
            handlePhotoFiles,
            handleWatermarkFile,
            applyWatermarkToAllPhotos,
            downloadAllProcessedImages,
            renderCurrentPreview,
            getSettings
        };
    }

    if (document.readyState === "loading") {
        window.addEventListener("DOMContentLoaded", init, { once: true });
    } else {
        init();
    }
})();
