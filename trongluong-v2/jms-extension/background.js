const LOCAL_SERVER = 'http://localhost:3000';
const API_KEY = 'TL_SECRET_SECURE_API_KEY_2026';

// Chuyển ArrayBuffer sang Base64 để truyền tải qua chrome.runtime messages
function arrayBufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'fetchOrder') {
        const { barcode } = request;
        const url = `${LOCAL_SERVER}/api/orders?maVanDon=${barcode}&apiKey=${API_KEY}`;
        
        fetch(url)
            .then(res => {
                if (!res.ok) {
                    throw new Error(`HTTP status ${res.status}`);
                }
                return res.json();
            })
            .then(data => {
                sendResponse({ success: true, data: data });
            })
            .catch(err => {
                if (err.message && err.message.includes('404')) {
                    console.log(`[JMS background] Đơn ${barcode} chưa có tệp tin trên local (404)`);
                } else {
                    console.warn('Fetch order error in background:', err);
                }
                sendResponse({ success: false, error: err.message });
            });
            
        return true; // Giữ kênh tin nhắn mở bất đồng bộ
    }
    
    if (request.action === 'downloadFile') {
        const { storedName, barcode } = request;
        const fileUrl = `${LOCAL_SERVER}/uploads/${barcode}/${storedName}?apiKey=${API_KEY}`;
        
        fetch(fileUrl)
            .then(res => {
                if (!res.ok) throw new Error(`HTTP status ${res.status}`);
                return res.arrayBuffer();
            })
            .then(buffer => {
                const base64 = arrayBufferToBase64(buffer);
                sendResponse({ success: true, base64: base64 });
            })
            .catch(err => {
                console.warn('Download file error in background:', err);
                sendResponse({ success: false, error: err.message });
            });
            
        return true; // Giữ kênh tin nhắn mở bất đồng bộ
    }

    if (request.action === 'updateOrderStatus') {
        const { id, trangThai } = request;
        const url = `${LOCAL_SERVER}/api/orders/${id}?apiKey=${API_KEY}`;
        
        fetch(url, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': API_KEY
            },
            body: JSON.stringify({ trangThai: trangThai })
        })
            .then(res => {
                if (!res.ok) throw new Error(`HTTP status ${res.status}`);
                return res.json();
            })
            .then(data => {
                sendResponse({ success: true, data: data });
            })
            .catch(err => {
                console.warn('Update order status error in background:', err);
                sendResponse({ success: false, error: err.message });
            });
            
        return true; // Giữ kênh tin nhắn mở bất đồng bộ
    }

    if (request.action === 'openFolder') {
        const { barcode } = request;
        const url = `${LOCAL_SERVER}/api/orders/open-folder?maVanDon=${barcode}&apiKey=${API_KEY}`;
        
        fetch(url)
            .then(res => {
                if (!res.ok) throw new Error(`HTTP status ${res.status}`);
                return res.json();
            })
            .then(data => {
                sendResponse({ success: true, data: data });
            })
            .catch(err => {
                console.warn('Open folder error in background:', err);
                sendResponse({ success: false, error: err.message });
            });
            
        return true; // Giữ kênh tin nhắn mở bất đồng bộ
    }
});
