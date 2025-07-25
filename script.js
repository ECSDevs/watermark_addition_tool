// 动态背景图片功能（已禁用自动刷新）
function updateBackgroundImage() {
    const timestamp = new Date().getTime();
    const backgroundUrl = `https://img.mod.wiki/acg/?t=${timestamp}`;
    document.body.style.background = `linear-gradient(rgba(0, 0, 0, 0.3), rgba(0, 0, 0, 0.3)), url('${backgroundUrl}') center/cover no-repeat fixed`;
    document.body.style.backgroundSize = 'cover';
    document.body.style.backgroundAttachment = 'fixed';
}

// 页面加载时更新一次背景（移除了自动刷新）
window.addEventListener('load', updateBackgroundImage);

// 全局变量
const photoInput = document.getElementById('photoInput');
const photoUpload = document.getElementById('photoUpload');
const watermarkInput = document.getElementById('watermarkInput');
const watermarkUpload = document.getElementById('watermarkUpload');
const watermarkPreview = document.getElementById('watermarkPreview');
const watermarkPreviewContainer = document.getElementById('watermarkPreviewContainer');
const watermarkInfo = document.getElementById('watermarkInfo');
const previewImage = document.getElementById('previewImage');
const previewContainer = document.getElementById('previewContainer');
const thumbnailContainer = document.getElementById('thumbnailContainer');
const noImagesMessage = document.getElementById('noImagesMessage');
const applyWatermarkBtn = document.getElementById('applyWatermarkBtn');
const downloadAllBtn = document.getElementById('downloadAllBtn');
const loading = document.getElementById('loading');
const autoColorSwitch = document.getElementById('autoColorSwitch');
const manualColorGroup = document.getElementById('manualColorGroup');
const watermarkColor = document.getElementById('watermarkColor');
const colorButtons = document.querySelectorAll('.color-btn');

// 设置滑块
const opacityRange = document.getElementById('opacityRange');
const opacityValue = document.getElementById('opacityValue');
const sizeRange = document.getElementById('sizeRange');
const sizeValue = document.getElementById('sizeValue');
const marginRange = document.getElementById('marginRange');
const marginValue = document.getElementById('marginValue');

// 存储上传的图片和处理后的图片
let uploadedPhotos = [];
let watermarkImage = null;
let processedImages = [];
let currentPhotoIndex = 0;

// 性能优化相关
let isProcessing = false;
let processingProgress = 0;

// 初始化拖放功能
function initDragAndDrop() {
    // 照片上传区域
    photoUpload.addEventListener('dragover', (e) => {
        e.preventDefault();
        photoUpload.classList.add('highlight');
    });
    
    photoUpload.addEventListener('dragleave', () => {
        photoUpload.classList.remove('highlight');
    });
    
    photoUpload.addEventListener('drop', (e) => {
        e.preventDefault();
        photoUpload.classList.remove('highlight');
        if (e.dataTransfer.files.length > 0) {
            handlePhotoFiles(e.dataTransfer.files);
        }
    });
    
    // 水印上传区域
    watermarkUpload.addEventListener('dragover', (e) => {
        e.preventDefault();
        watermarkUpload.classList.add('highlight');
    });
    
    watermarkUpload.addEventListener('dragleave', () => {
        watermarkUpload.classList.remove('highlight');
    });
    
    watermarkUpload.addEventListener('drop', (e) => {
        e.preventDefault();
        watermarkUpload.classList.remove('highlight');
        if (e.dataTransfer.files.length > 0 && e.dataTransfer.files[0].type === 'image/png') {
            handleWatermarkFile(e.dataTransfer.files[0]);
        } else {
            alert('请上传PNG格式的水印图片');
        }
    });
}

// 初始化事件监听
function initEventListeners() {
    // 照片上传点击事件
    photoUpload.addEventListener('click', () => {
        photoInput.click();
    });
    
    photoInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handlePhotoFiles(e.target.files);
        }
    });
    
    // 水印上传点击事件
    watermarkUpload.addEventListener('click', () => {
        watermarkInput.click();
    });
    
    watermarkInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            if (e.target.files[0].type === 'image/png') {
                handleWatermarkFile(e.target.files[0]);
            } else {
                alert('请上传PNG格式的水印图片');
            }
        }
    });
    
    // 应用水印按钮
    applyWatermarkBtn.addEventListener('click', applyWatermarkToAllPhotos);
    
    // 下载所有按钮
    downloadAllBtn.addEventListener('click', downloadAllProcessedImages);
    
    // 滑块事件
    opacityRange.addEventListener('input', updateOpacityValue);
    sizeRange.addEventListener('input', updateSizeValue);
    marginRange.addEventListener('input', updateMarginValue);
    
    // 滑块变化时重新应用水印
    opacityRange.addEventListener('change', () => {
        if (uploadedPhotos.length > 0 && watermarkImage) {
            applyWatermarkToCurrentPhoto();
        }
    });
    
    sizeRange.addEventListener('change', () => {
        if (uploadedPhotos.length > 0 && watermarkImage) {
            applyWatermarkToCurrentPhoto();
        }
    });
    
    marginRange.addEventListener('change', () => {
        if (uploadedPhotos.length > 0 && watermarkImage) {
            applyWatermarkToCurrentPhoto();
        }
    });
    
    // 自动颜色切换复选框事件
    autoColorSwitch.addEventListener('change', () => {
        // 显示或隐藏手动颜色选择区域
        manualColorGroup.style.display = autoColorSwitch.checked ? 'none' : 'block';
        
        // 如果有照片和水印，重新应用水印
        if (uploadedPhotos.length > 0 && watermarkImage) {
            applyWatermarkToCurrentPhoto();
        }
    });
    
    // 颜色选择器事件
    watermarkColor.addEventListener('change', () => {
        if (uploadedPhotos.length > 0 && watermarkImage) {
            applyWatermarkToCurrentPhoto();
        }
    });
    
    // 颜色按钮点击事件
    colorButtons.forEach(button => {
        button.addEventListener('click', () => {
            // 更新颜色选择器的值
            watermarkColor.value = button.dataset.color;
            
            // 更新按钮样式
            colorButtons.forEach(btn => {
                btn.style.border = '2px solid #ccc';
            });
            button.style.border = '2px solid #3498db';
            
            // 如果有照片和水印，重新应用水印
            if (uploadedPhotos.length > 0 && watermarkImage) {
                applyWatermarkToCurrentPhoto();
            }
        });
    });
}

// 处理上传的照片文件（优化版本）
function handlePhotoFiles(files) {
    uploadedPhotos = [];
    thumbnailContainer.innerHTML = '';
    processedImages = [];
    
    const fileArray = Array.from(files);
    
    // 限制同时处理的文件数量，避免内存溢出
    const batchSize = 5;
    let currentIndex = 0;
    
    function processBatch() {
        const batch = fileArray.slice(currentIndex, currentIndex + batchSize);
        
        batch.forEach((file, index) => {
            if (file.type.startsWith('image/')) {
                // 检查文件大小，大文件进行压缩
                if (file.size > 5 * 1024 * 1024) { // 5MB以上的文件
                    compressImage(file, (compressedDataURL) => {
                        processImageFile(compressedDataURL, file.name, currentIndex + index);
                    });
                } else {
                    const reader = new FileReader();
                    reader.onload = (e) => {
                        processImageFile(e.target.result, file.name, currentIndex + index);
                    };
                    reader.readAsDataURL(file);
                }
            }
        });
        
        currentIndex += batchSize;
        
        if (currentIndex < fileArray.length) {
            // 使用requestAnimationFrame避免阻塞UI
            requestAnimationFrame(() => {
                setTimeout(processBatch, 50); // 小延迟避免卡顿
            });
        }
    }
    
    processBatch();
    
    // 隐藏无图片消息
    noImagesMessage.style.display = 'none';
}

// 压缩大图片（优化版本）
function compressImage(file, callback) {
    const reader = new FileReader();
    reader.onload = function(e) {
        const img = new Image();
        img.onload = function() {
            // 复用canvas或创建新的
            let canvas = document.getElementById('compress-canvas');
            if (!canvas) {
                canvas = document.createElement('canvas');
                canvas.id = 'compress-canvas';
                canvas.style.display = 'none';
                document.body.appendChild(canvas);
            }
            const ctx = canvas.getContext('2d');
            
            // 如果图片过大，进行缩放
            let { width, height } = img;
            const maxDimension = 2048; // 最大尺寸
            
            if (width > maxDimension || height > maxDimension) {
                if (width > height) {
                    height = (height * maxDimension) / width;
                    width = maxDimension;
                } else {
                    width = (width * maxDimension) / height;
                    height = maxDimension;
                }
            }
            
            canvas.width = width;
            canvas.height = height;
            
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(img, 0, 0, width, height);
            
            const compressedDataURL = canvas.toDataURL('image/jpeg', 0.8);
            
            // 清理canvas内容以释放内存
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            // 清理图片引用
            img.onload = null;
            img.src = '';
            
            callback(compressedDataURL);
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

// 处理单个图片文件
function processImageFile(src, name, index) {
    uploadedPhotos.push({
        name: name,
        src: src
    });
    
    // 创建缩略图
    createThumbnail(src, uploadedPhotos.length - 1);
    
    // 如果是第一张图片，显示预览
    if (uploadedPhotos.length === 1) {
        showPhotoPreview(0);
    }
    
    // 如果水印已上传，启用应用水印按钮
    updateButtonState();
}

// 处理上传的水印文件
function handleWatermarkFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        watermarkImage = new Image();
        watermarkImage.onload = () => {
            // 显示水印预览
            watermarkPreview.src = e.target.result;
            watermarkPreview.style.display = 'block';
            watermarkPreviewContainer.style.display = 'block';
            watermarkInfo.textContent = `${file.name} (${watermarkImage.width}×${watermarkImage.height}px)`;
            
            // 如果有照片，应用水印到当前照片
            if (uploadedPhotos.length > 0) {
                applyWatermarkToCurrentPhoto();
            }
            
            // 更新按钮状态
            updateButtonState();
        };
        watermarkImage.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

// 创建缩略图（优化版本）
function createThumbnail(src, index) {
    const img = document.createElement('img');
    
    // 复用canvas或创建新的
    let canvas = document.getElementById('thumbnail-canvas');
    if (!canvas) {
        canvas = document.createElement('canvas');
        canvas.id = 'thumbnail-canvas';
        canvas.style.display = 'none';
        document.body.appendChild(canvas);
    }
    const ctx = canvas.getContext('2d');
    const tempImg = new Image();
    
    tempImg.onload = () => {
        // 设置更小的缩略图大小以提高性能
        const maxSize = 100;
        let width = tempImg.width;
        let height = tempImg.height;
        
        if (width > height) {
            if (width > maxSize) {
                height = (height * maxSize) / width;
                width = maxSize;
            }
        } else {
            if (height > maxSize) {
                width = (width * maxSize) / height;
                height = maxSize;
            }
        }
        
        canvas.width = width;
        canvas.height = height;
        
        // 使用更高的压缩率
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'low';
        ctx.drawImage(tempImg, 0, 0, width, height);
        
        const thumbnailData = canvas.toDataURL('image/jpeg', 0.6);
        img.src = thumbnailData;
        
        // 清理canvas内容以释放内存
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // 清理图片引用
        tempImg.onload = null;
        tempImg.src = '';
    };
    
    tempImg.src = src;
    img.classList.add('thumbnail');
    img.dataset.index = index;
    
    if (index === 0) {
        img.classList.add('active');
    }
    
    img.addEventListener('click', () => {
        // 移除所有活动状态
        document.querySelectorAll('.thumbnail').forEach(thumb => {
            thumb.classList.remove('active');
        });
        
        // 添加活动状态到当前缩略图
        img.classList.add('active');
        
        // 显示对应的照片
        showPhotoPreview(index);
    });
    
    thumbnailContainer.appendChild(img);
}

// 显示照片预览
function showPhotoPreview(index) {
    currentPhotoIndex = index;
    const photo = uploadedPhotos[index];
    
    // 如果已经处理过这张照片，显示处理后的图片
    if (processedImages[index]) {
        previewImage.src = processedImages[index];
    } else {
        previewImage.src = photo.src;
    }
    
    previewImage.style.display = 'block';
    
    // 如果水印已上传，应用水印
    if (watermarkImage) {
        applyWatermarkToCurrentPhoto();
    }
}

// 应用水印到当前照片（优化版本）
function applyWatermarkToCurrentPhoto() {
    if (!uploadedPhotos[currentPhotoIndex] || !watermarkImage) return;
    
    const photo = uploadedPhotos[currentPhotoIndex];
    
    // 复用canvas或创建新的
    let canvas = document.getElementById('temp-canvas');
    if (!canvas) {
        canvas = document.createElement('canvas');
        canvas.id = 'temp-canvas';
        canvas.style.display = 'none';
        document.body.appendChild(canvas);
    }
    const ctx = canvas.getContext('2d');
    
    // 创建图像对象
    const img = new Image();
    img.onload = () => {
        // 设置画布大小为图片大小
        canvas.width = img.width;
        canvas.height = img.height;
        
        // 绘制原始图片
        ctx.drawImage(img, 0, 0);
        
        // 获取设置值
        const opacity = parseInt(opacityRange.value) / 100;
        const size = parseInt(sizeRange.value) / 100;
        const margin = parseInt(marginRange.value);
        
        // 计算水印大小
        const watermarkWidth = img.width * size;
        const watermarkHeight = (watermarkImage.height / watermarkImage.width) * watermarkWidth;
        
        // 计算水印位置（底部居中）
        const watermarkX = (img.width - watermarkWidth) / 2;
        const watermarkY = img.height - watermarkHeight - margin;
        
        // 复用临时canvas
        let tempCanvas = document.getElementById('temp-watermark-canvas');
        if (!tempCanvas) {
            tempCanvas = document.createElement('canvas');
            tempCanvas.id = 'temp-watermark-canvas';
            tempCanvas.style.display = 'none';
            document.body.appendChild(tempCanvas);
        }
        tempCanvas.width = watermarkImage.width;
        tempCanvas.height = watermarkImage.height;
        const tempCtx = tempCanvas.getContext('2d');
        
        // 清除之前的内容
        tempCtx.clearRect(0, 0, tempCanvas.width, tempCanvas.height);
        
        // 绘制原始水印
        tempCtx.drawImage(watermarkImage, 0, 0);
        
        // 应用颜色滤镜
        tempCtx.globalCompositeOperation = 'source-in';
        
        // 如果启用了自动颜色切换，分析背景颜色并设置水印颜色
        if (autoColorSwitch.checked) {
            // 分析水印区域的背景亮度
            const color = analyzeImageBrightness(ctx, watermarkX, watermarkY, watermarkWidth, watermarkHeight);
            tempCtx.fillStyle = color;
        } else {
            // 使用手动选择的颜色
            tempCtx.fillStyle = watermarkColor.value;
        }
        
        tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
        
        // 设置透明度
        ctx.globalAlpha = opacity;
        
        // 绘制彩色水印
        ctx.drawImage(tempCanvas, watermarkX, watermarkY, watermarkWidth, watermarkHeight);
        
        // 重置透明度和混合模式
        ctx.globalAlpha = 1.0;
        tempCtx.globalCompositeOperation = 'source-over';
        
        // 更新预览图片，使用压缩
        const dataURL = canvas.toDataURL('image/jpeg', 0.85);
        previewImage.src = dataURL;
        
        // 存储处理后的图片
        processedImages[currentPhotoIndex] = dataURL;
    };
    img.src = photo.src;
}

// 应用水印到所有照片
function applyWatermarkToAllPhotos() {
    if (uploadedPhotos.length === 0 || !watermarkImage) return;
    
    // 显示加载动画
    loading.style.display = 'block';
    downloadAllBtn.disabled = true;
    
    // 使用setTimeout来避免UI阻塞
    setTimeout(() => {
        processAllPhotos().then(() => {
            // 隐藏加载动画
            loading.style.display = 'none';
            downloadAllBtn.disabled = false;
            
            // 更新当前预览
            showPhotoPreview(currentPhotoIndex);
            
            // 处理完成，不再显示确认对话框
            console.log('所有图片处理完成！');
        });
    }, 100);
}

// 处理所有照片（优化版本）
async function processAllPhotos() {
    if (isProcessing) return;
    isProcessing = true;
    
    try {
        // 显示进度
        showProcessingProgress();
        
        // 获取设置值
        const opacity = parseInt(opacityRange.value) / 100;
        const size = parseInt(sizeRange.value) / 100;
        const margin = parseInt(marginRange.value);
        
        // 创建复用的canvas
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        // 创建复用的临时canvas
        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d');
        
        // 批量处理，每次处理2张图片（减少内存压力）
        const batchSize = 2;
        
        for (let batchStart = 0; batchStart < uploadedPhotos.length; batchStart += batchSize) {
            const batchEnd = Math.min(batchStart + batchSize, uploadedPhotos.length);
            
            // 处理当前批次
            for (let i = batchStart; i < batchEnd; i++) {
                await new Promise(resolve => {
                    const photo = uploadedPhotos[i];
                    const img = new Image();
                    
                    img.onload = () => {
                        try {
                            // 设置画布大小
                            canvas.width = img.width;
                            canvas.height = img.height;
                            
                            // 绘制原始图片
                            ctx.drawImage(img, 0, 0);
                            
                            // 计算水印大小
                            const watermarkWidth = img.width * size;
                            const watermarkHeight = (watermarkImage.height / watermarkImage.width) * watermarkWidth;
                            
                            // 计算水印位置（底部居中）
                            const watermarkX = (img.width - watermarkWidth) / 2;
                            const watermarkY = img.height - watermarkHeight - margin;
                            
                            // 复用临时画布
                            tempCanvas.width = watermarkImage.width;
                            tempCanvas.height = watermarkImage.height;
                            
                            // 清除之前的内容
                            tempCtx.clearRect(0, 0, tempCanvas.width, tempCanvas.height);
                            
                            // 绘制原始水印
                            tempCtx.drawImage(watermarkImage, 0, 0);
                            
                            // 应用颜色滤镜
                            tempCtx.globalCompositeOperation = 'source-in';
                            
                            // 如果启用了自动颜色切换，分析背景颜色并设置水印颜色
                            if (autoColorSwitch.checked) {
                                // 分析水印区域的背景亮度
                                const color = analyzeImageBrightness(ctx, watermarkX, watermarkY, watermarkWidth, watermarkHeight);
                                tempCtx.fillStyle = color;
                            } else {
                                // 使用手动选择的颜色
                                tempCtx.fillStyle = watermarkColor.value;
                            }
                            
                            tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
                            
                            // 设置透明度
                            ctx.globalAlpha = opacity;
                            
                            // 绘制彩色水印
                            ctx.drawImage(tempCanvas, watermarkX, watermarkY, watermarkWidth, watermarkHeight);
                            
                            // 重置透明度和混合模式
                            ctx.globalAlpha = 1.0;
                            tempCtx.globalCompositeOperation = 'source-over';
                            
                            // 存储处理后的图片，使用更高的压缩率
                            const dataURL = canvas.toDataURL('image/jpeg', 0.85);
                            processedImages[i] = dataURL;
                            
                            // 更新进度
                            processingProgress = ((i + 1) / uploadedPhotos.length) * 100;
                            updateProcessingProgress();
                            
                            // 清理图片引用
                            img.onload = null;
                            img.src = '';
                            
                            resolve();
                        } catch (error) {
                            console.error('处理图片时出错:', error);
                            resolve();
                        }
                    };
                    
                    img.onerror = () => {
                        console.error('加载图片失败:', photo.name);
                        resolve();
                    };
                    
                    img.src = photo.src;
                });
            }
            
            // 批次间添加小延迟，避免阻塞UI，并强制垃圾回收
            if (batchEnd < uploadedPhotos.length) {
                await new Promise(resolve => {
                    requestAnimationFrame(() => {
                        // 强制垃圾回收（如果浏览器支持）
                        if (window.gc) {
                            window.gc();
                        }
                        setTimeout(resolve, 50);
                    });
                });
            }
        }
        
        // 清理canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        tempCtx.clearRect(0, 0, tempCanvas.width, tempCanvas.height);
        
    } catch (error) {
        console.error('批量处理失败:', error);
    } finally {
        isProcessing = false;
        hideProcessingProgress();
        updateButtonState();
    }
}

// 下载所有处理后的图片（优化版本）
function downloadAllProcessedImages() {
    if (processedImages.length === 0) return;
    
    // 批量下载，避免同时创建过多DOM元素
    const downloadBatch = (startIndex) => {
        const batchSize = 5;
        const endIndex = Math.min(startIndex + batchSize, processedImages.length);
        
        for (let i = startIndex; i < endIndex; i++) {
            const link = document.createElement('a');
            const originalName = uploadedPhotos[i].name;
            const extension = originalName.substring(originalName.lastIndexOf('.'));
            const fileName = originalName.substring(0, originalName.lastIndexOf('.')) + '_watermarked' + extension;
            
            link.href = processedImages[i];
            link.download = fileName;
            link.style.display = 'none';
            
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
        
        // 如果还有更多文件，延迟处理下一批
        if (endIndex < processedImages.length) {
            setTimeout(() => downloadBatch(endIndex), 100);
        }
    };
    
    downloadBatch(0);
}

// 更新透明度值显示
function updateOpacityValue() {
    opacityValue.textContent = opacityRange.value + '%';
}

// 更新大小值显示
function updateSizeValue() {
    sizeValue.textContent = sizeRange.value + '%';
}

// 更新边距值显示
function updateMarginValue() {
    marginValue.textContent = marginRange.value + 'px';
}

// 更新按钮状态
function updateButtonState() {
    applyWatermarkBtn.disabled = !(uploadedPhotos.length > 0 && watermarkImage) || isProcessing;
    downloadAllBtn.disabled = processedImages.length === 0 || isProcessing;
}

// 显示处理进度
function showProcessingProgress() {
    processingProgress = 0;
    
    // 创建进度条（如果不存在）
    let progressContainer = document.getElementById('progress-container');
    if (!progressContainer) {
        progressContainer = document.createElement('div');
        progressContainer.id = 'progress-container';
        progressContainer.innerHTML = `
            <div class="progress-bar">
                <div class="progress-fill" id="progress-fill"></div>
                <span class="progress-text" id="progress-text">处理中... 0%</span>
            </div>
        `;
        progressContainer.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(0, 0, 0, 0.8);
            color: white;
            padding: 20px;
            border-radius: 10px;
            z-index: 1000;
            min-width: 300px;
            text-align: center;
        `;
        
        const progressBar = progressContainer.querySelector('.progress-bar');
        progressBar.style.cssText = `
            width: 100%;
            height: 20px;
            background: #333;
            border-radius: 10px;
            overflow: hidden;
            position: relative;
            margin-bottom: 10px;
        `;
        
        const progressFill = progressContainer.querySelector('.progress-fill');
        progressFill.style.cssText = `
            height: 100%;
            background: linear-gradient(90deg, #4CAF50, #45a049);
            width: 0%;
            transition: width 0.3s ease;
        `;
        
        const progressText = progressContainer.querySelector('.progress-text');
        progressText.style.cssText = `
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            font-size: 12px;
            font-weight: bold;
        `;
        
        document.body.appendChild(progressContainer);
    }
    
    progressContainer.style.display = 'block';
}

// 更新处理进度
function updateProcessingProgress() {
    const progressFill = document.getElementById('progress-fill');
    const progressText = document.getElementById('progress-text');
    
    if (progressFill && progressText) {
        progressFill.style.width = processingProgress + '%';
        progressText.textContent = `处理中... ${Math.round(processingProgress)}%`;
    }
}

// 隐藏处理进度
function hideProcessingProgress() {
    const progressContainer = document.getElementById('progress-container');
    if (progressContainer) {
        progressContainer.style.display = 'none';
    }
}

// 清理内存函数
function cleanupMemory() {
    // 清理处理过的图片数据（保留最近的10张）
    if (processedImages.length > 10) {
        processedImages.splice(0, processedImages.length - 10);
    }
    
    // 强制垃圾回收（如果浏览器支持）
    if (window.gc) {
        window.gc();
    }
}

// 定期清理内存
setInterval(cleanupMemory, 30000); // 每30秒清理一次

// 分析图片区域颜色并决定水印颜色（只分析水印实际覆盖的像素）
function analyzeImageBrightness(ctx, x, y, width, height) {
    // 获取水印区域的像素数据
    const imageData = ctx.getImageData(x, y, width, height);
    const data = imageData.data;
    
    // 创建一个临时画布来获取水印的alpha通道信息
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = width;
    tempCanvas.height = height;
    const tempCtx = tempCanvas.getContext('2d');
    
    // 将水印绘制到临时画布上，缩放到目标大小
    tempCtx.drawImage(watermarkImage, 0, 0, width, height);
    const watermarkData = tempCtx.getImageData(0, 0, width, height);
    const watermarkPixels = watermarkData.data;
    
    let totalR = 0, totalG = 0, totalB = 0;
    let totalBrightness = 0;
    let pixelCount = 0;
    
    // 只计算水印实际覆盖的像素（alpha > 0的像素）
    for (let i = 0; i < data.length; i += 4) {
        const watermarkAlpha = watermarkPixels[i + 3]; // 水印的alpha通道
        
        // 只有当水印在这个位置有像素时（alpha > 0），才计算背景颜色
        if (watermarkAlpha > 0) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            
            totalR += r;
            totalG += g;
            totalB += b;
            
            // 使用相对亮度公式: 0.299*R + 0.587*G + 0.114*B
            const brightness = 0.299 * r + 0.587 * g + 0.114 * b;
            totalBrightness += brightness;
            pixelCount++;
        }
    }
    
    // 如果没有有效像素，回退到简单的黑白判断
    if (pixelCount === 0) {
        // 计算整个区域的平均亮度作为回退
        let fallbackBrightness = 0;
        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            fallbackBrightness += 0.299 * r + 0.587 * g + 0.114 * b;
        }
        fallbackBrightness /= (data.length / 4);
        return fallbackBrightness > 128 ? '#000000' : '#FFFFFF';
    }
    
    // 计算平均亮度
    const averageBrightness = totalBrightness / pixelCount;
    
    // 使用简单而有效的黑白选择策略
    // 如果背景较亮（亮度 > 128），使用黑色水印
    // 如果背景较暗（亮度 <= 128），使用白色水印
    // 这样可以确保良好的对比度和可读性
    return averageBrightness > 128 ? '#000000' : '#FFFFFF';
}

// 计算两个亮度值之间的对比度比率
function calculateContrastRatio(luminance1, luminance2) {
    const lighter = Math.max(luminance1, luminance2);
    const darker = Math.min(luminance1, luminance2);
    return (lighter + 0.05) / (darker + 0.05);
}

// RGB转HSL颜色空间
function rgbToHsl(r, g, b) {
    r /= 255;
    g /= 255;
    b /= 255;
    
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;
    
    if (max === min) {
        h = s = 0; // 灰色
    } else {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }
        
        h /= 6;
    }
    
    return [h, s, l];
}

// HSL转RGB颜色空间
function hslToRgb(h, s, l) {
    let r, g, b;
    
    if (s === 0) {
        r = g = b = l; // 灰色
    } else {
        const hue2rgb = (p, q, t) => {
            if (t < 0) t += 1;
            if (t > 1) t -= 1;
            if (t < 1/6) return p + (q - p) * 6 * t;
            if (t < 1/2) return q;
            if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
            return p;
        };
        
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        
        r = hue2rgb(p, q, h + 1/3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1/3);
    }
    
    return [r * 255, g * 255, b * 255];
}

// 初始化应用
function init() {
    initDragAndDrop();
    initEventListeners();
    updateOpacityValue();
    updateSizeValue();
    updateMarginValue();
}

// 启动应用
init();