// ==UserScript==
// @name         J&T JMS Auto-Fill Assistant
// @namespace    http://tampermonkey.net/
// @version      1.4
// @description  Tự động hóa đối soát điền cân nặng thực tế và tải ảnh/video minh chứng lên J&T JMS (Bản Bán Tự Động Siêu Cấp)
// @author       Antigravity
// @match        *://*.jtexpress.vn/*
// @grant        GM_xmlhttpRequest
// @connect      localhost
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    const LOCAL_SERVER = 'http://localhost:3000';
    const API_KEY = 'TL_SECRET_SECURE_API_KEY_2026';

    console.log('%c🚀 [J&T JMS Assistant] Tampermonkey Script đã khởi chạy ở chế độ Hỗ trợ đối soát!', 'color: #10b981; font-weight: bold; font-size: 14px;');

    function log(msg, type = 'info') {
        const colors = {
            info: '#3b82f6',
            success: '#10b981',
            warn: '#f59e0b',
            error: '#ef4444'
        };
        console.log(`%c[JMS Assistant] ${msg}`, `color: ${colors[type] || '#333'}; font-weight: 600;`);
    }

    // Helper gọi API bất chấp Mixed Content / CORS qua GM_xmlhttpRequest
    function httpGet(url, responseType = 'json') {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: url,
                responseType: responseType,
                onload: function(res) {
                    if (res.status >= 200 && res.status < 300) {
                        resolve(res.response);
                    } else {
                        reject(new Error(`HTTP status ${res.status}`));
                    }
                },
                onerror: function(err) {
                    reject(err);
                }
            });
        });
    }

    // Gán giá trị chuẩn React/Vue để cập nhật state trên J&T JMS
    function setReactInputValue(input, val) {
        if (!input) return;
        try {
            const lastValue = input.value;
            input.value = val;
            
            const tracker = input._valueTracker;
            if (tracker) {
                tracker.setValue(lastValue);
            }
            
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
            input.dispatchEvent(new Event('blur', { bubbles: true }));
            
            log(`🎯 Đã gán giá trị React/Vue thành công cho ô: ${val}`, 'success');
        } catch (err) {
            log(`⚠️ Lỗi gán React state: ${err.message}`, 'warn');
            input.value = val; // Fallback
        }
    }

    // Tìm kiếm Hộp thoại Modal đang hiển thị trên màn hình
    function findActiveModal() {
        return document.querySelector('.ant-modal, .ant-modal-content, [role="dialog"], .modal-content, .modal');
    }

    // Tìm kiếm ô nhập Trọng lượng sau khi đổi trong phạm vi Container
    function findWeightInput(container) {
        const root = container || document;
        const elements = Array.from(root.querySelectorAll('label, span, div, p, th'));
        let targetLabel = null;
        
        for (const el of elements) {
            if (el.children.length === 0 || (el.children.length === 1 && el.children[0].tagName === 'SPAN')) {
                const text = el.textContent.trim();
                if (text.includes('Trọng lượng sau khi đổi') && !text.includes('Trọng lượng ban đầu') && !text.includes('quy đổi')) {
                    targetLabel = el;
                    break;
                }
            }
        }
        
        if (!targetLabel) return null;

        let parent = targetLabel.parentElement;
        let depth = 0;
        while (parent && depth < 3) {
            const input = parent.querySelector('input:not([type="hidden"]):not([type="file"])');
            if (input) return input;
            parent = parent.parentElement;
            depth++;
        }
        
        return null;
    }

    // Tìm kiếm ô chọn File Upload trong phạm vi Container
    function findFileInput(container) {
        const root = container || document;
        const elements = Array.from(root.querySelectorAll('label, span, div, p'));
        let targetLabel = null;
        for (const el of elements) {
            if (el.children.length === 0 || (el.children.length === 1 && el.children[0].tagName === 'SPAN')) {
                const text = el.textContent.trim();
                if (text.includes('Đăng tải hình ảnh')) {
                    targetLabel = el;
                    break;
                }
            }
        }
        
        if (targetLabel) {
            let parent = targetLabel.parentElement;
            let depth = 0;
            while (parent && depth < 3) {
                const input = parent.querySelector('input[type="file"]');
                if (input) return input;
                parent = parent.parentElement;
                depth++;
            }
        }
        
        return root.querySelector('input[type="file"]');
    }

    // Quét tìm mã vận đơn đang hiển thị trong Modal (siêu chính xác)
    function getActiveBarcode() {
        const modal = findActiveModal();
        if (!modal) return null; 

        const inputs = Array.from(modal.querySelectorAll('input:not([type="hidden"]):not([type="file"])'));
        for (const input of inputs) {
            const val = input.value?.trim();
            if (val && /^\d{10,12}$/.test(val)) {
                return val;
            }
        }

        const textElements = Array.from(modal.querySelectorAll('span, div, p, label'));
        for (const el of textElements) {
            if (el.children.length === 0) {
                const text = el.textContent.trim();
                if (text && /^\d{10,12}$/.test(text)) {
                    return text;
                }
            }
        }

        return null;
    }

    let lastProcessedBarcode = '';
    let isProcessing = false;
    let activeOrderData = null;

    async function autoFillWeightOnly(barcode) {
        if (isProcessing) return;
        isProcessing = true;
        
        log(`🔎 Phát hiện Mã Vận Đơn trong Modal: "${barcode}". Khởi động truy vấn cân nặng...`, 'info');

        try {
            const url = `${LOCAL_SERVER}/api/orders?maVanDon=${barcode}&apiKey=${API_KEY}`;
            const response = await httpGet(url, 'json');
            isProcessing = false;

            if (!response || !response.ok || !response.data) {
                log(`⚠️ Không tìm thấy thông tin cân nặng của đơn ${barcode} trên local server.`, 'warn');
                activeOrderData = null;
                return;
            }

            const order = response.data;
            activeOrderData = order;
            log(`🎉 Tìm thấy dữ liệu! Cân nặng: ${order.soKy} kg. Số tệp: ${order.files?.length || 0}`, 'success');

            const modal = findActiveModal();
            if (modal) {
                const weightInput = findWeightInput(modal);
                if (weightInput) {
                    setReactInputValue(weightInput, order.soKy);
                    log(`✅ Đã tự động điền cân nặng: ${order.soKy} kg`, 'success');
                }
            }
        } catch (err) {
            isProcessing = false;
            log(`[JMS Assistant] Lỗi truy vấn cân nặng: ${err.message}`, 'warn');
        }
    }

    function setupFileInputListener(modal) {
        const fileInput = findFileInput(modal);
        if (!fileInput) return;

        // Tránh gán nhiều listener trùng lặp
        if (fileInput.dataset.jmsListenerAttached) return;
        fileInput.dataset.jmsListenerAttached = 'true';

        // Lắng nghe sự kiện click ở capturing phase để tự động mở thư mục cục bộ và copy path
        fileInput.addEventListener('click', async (e) => {
            const barcode = getActiveBarcode();
            if (!barcode) return;

            log(`🚀 Người dùng click [+][Bấm tải lên]. Yêu cầu server mở thư mục Finder & copy path cho mã vận đơn: ${barcode}`, 'success');
            
            try {
                const url = `${LOCAL_SERVER}/api/orders/open-folder?maVanDon=${barcode}&apiKey=${API_KEY}`;
                const response = await httpGet(url, 'json');
                if (response && response.ok) {
                    log(`✅ Đã mở Finder & copy path thành công: ${response.folderPath}`, 'success');
                } else {
                    log(`⚠️ Không thể mở thư mục cục bộ: ${response?.message || 'Lỗi không xác định'}`, 'warn');
                }
            } catch (err) {
                log(`⚠️ Lỗi gọi API open-folder: ${err.message}`, 'warn');
            }
            
            // KHÔNG gọi e.preventDefault() để Chrome vẫn mở hộp thoại chọn file native như bình thường!
        }, true);
    }

    // Nút bấm tải tệp tin tự động tiêm vào giao diện J&T
    function injectAutoUploadButton(modal) {
        if (modal.querySelector('#jms-inject-upload-btn')) return;

        const fileInput = findFileInput(modal);
        if (!fileInput) return;

        const targetContainer = fileInput.parentElement;
        if (!targetContainer) return;

        const btn = document.createElement('button');
        btn.id = 'jms-inject-upload-btn';
        btn.type = 'button';
        btn.style.cssText = `
            display: inline-flex;
            align-items: center;
            gap: 8px;
            background: linear-gradient(135deg, #10b981 0%, #059669 100%);
            color: white;
            border: none;
            padding: 8px 16px;
            border-radius: 8px;
            font-weight: 700;
            font-size: 13px;
            cursor: pointer;
            box-shadow: 0 4px 12px rgba(16, 185, 129, 0.2);
            transition: all 0.2s ease;
            margin-left: 15px;
            vertical-align: middle;
        `;
        btn.innerHTML = `<span>🚀</span> Tải ảnh/video tự động từ máy tính`;

        btn.addEventListener('mouseenter', () => {
            btn.style.transform = 'translateY(-1px)';
            btn.style.boxShadow = '0 6px 16px rgba(16, 185, 129, 0.3)';
        });
        btn.addEventListener('mouseleave', () => {
            btn.style.transform = 'none';
            btn.style.boxShadow = '0 4px 12px rgba(16, 185, 129, 0.2)';
        });

        btn.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();

            const barcode = getActiveBarcode();
            if (!barcode) {
                alert('Không tìm thấy mã vận đơn trên giao diện!');
                return;
            }

            btn.disabled = true;
            btn.innerHTML = `<span>⏳</span> Đang nạp ảnh/video...`;
            btn.style.background = '#64748b';

            try {
                const url = `${LOCAL_SERVER}/api/orders?maVanDon=${barcode}&apiKey=${API_KEY}`;
                const response = await httpGet(url, 'json');
                
                if (!response || !response.ok || !response.data) {
                    alert('Không tìm thấy tệp ảnh/video của đơn này trên local server!');
                    resetBtn();
                    return;
                }

                const order = response.data;
                if (!order.files || order.files.length === 0) {
                    alert('Đơn hàng này không có tệp minh chứng đính kèm!');
                    resetBtn();
                    return;
                }

                const dataTransfer = new DataTransfer();
                const downloadPromises = order.files.map(async (fileInfo) => {
                    try {
                        const fileUrl = `${LOCAL_SERVER}/uploads/${barcode}/${fileInfo.storedName}?apiKey=${API_KEY}`;
                        const arrayBuffer = await httpGet(fileUrl, 'arraybuffer');
                        const blob = new Blob([arrayBuffer], { type: fileInfo.mimeType });
                        const file = new File([blob], fileInfo.fileName, { type: fileInfo.mimeType });
                        dataTransfer.items.add(file);
                    } catch (fileErr) {}
                });

                await Promise.all(downloadPromises);

                if (dataTransfer.files.length > 0) {
                    fileInput.files = dataTransfer.files;
                    fileInput.dispatchEvent(new Event('change', { bubbles: true }));
                    btn.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
                    btn.innerHTML = `<span>✅</span> Đã tải lên thành công ${dataTransfer.files.length} tệp!`;
                    
                    // Ghi nhận đồng bộ trạng thái đơn lên SQLite cục bộ
                    if (order.id) {
                        GM_xmlhttpRequest({
                            method: 'PATCH',
                            url: `${LOCAL_SERVER}/api/orders/${order.id}?apiKey=${API_KEY}`,
                            headers: {
                                'Content-Type': 'application/json',
                                'X-API-Key': API_KEY
                            },
                            data: JSON.stringify({ trangThai: 'hoan_thanh' })
                        });
                    }
                    
                    setTimeout(resetBtn, 2000);
                } else {
                    alert('Lỗi tải tệp minh chứng từ local server.');
                    resetBtn();
                }
            } catch (err) {
                alert(`Lỗi: ${err.message}`);
                resetBtn();
            }

            function resetBtn() {
                btn.disabled = false;
                btn.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
                btn.innerHTML = `<span>🚀</span> Tải ảnh/video tự động từ máy tính`;
            }
        });

        // Chèn nút bên cạnh nhãn "Đăng tải hình ảnh"
        const targetLabel = targetContainer.querySelector('label, span, .ant-btn') || targetContainer;
        targetLabel.parentNode.insertBefore(btn, targetLabel.nextSibling);
    }

    // Vòng lặp tuần hoàn (Periodic Observer) kiểm soát liên tục 500ms
    setInterval(() => {
        const activeBarcode = getActiveBarcode();
        if (activeBarcode) {
            const modal = findActiveModal();
            if (modal) {
                injectAutoUploadButton(modal);
                setupFileInputListener(modal);
            }
            if (activeBarcode !== lastProcessedBarcode) {
                lastProcessedBarcode = activeBarcode;
                autoFillWeightOnly(activeBarcode);
            }
        } else {
            if (lastProcessedBarcode !== '') {
                log(`🧹 Reset trạng thái đối soát (Modal đã đóng).`, 'info');
                lastProcessedBarcode = '';
                activeOrderData = null;
            }
        }
    }, 500);

})();
