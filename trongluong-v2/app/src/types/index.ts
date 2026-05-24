export interface Order {
  id: string;
  maVanDon: string;
  soKy: number;
  trangThai: 'cho_xu_ly' | 'dang_xu_ly' | 'hoan_thanh' | 'loi';
  ghiChu?: string;
  createdAt: string;
  updatedAt: string;
  files?: FileInfo[];
}

export interface FileInfo {
  id: string;
  orderId: string;
  fileName: string;
  storedName: string;
  mimeType: string;
  size: number;
  path: string;
  createdAt: string;
}

export interface UploadFile {
  uri: string;
  name: string;
  type: string;
  size: number;
  progress: number; // 0 to 100
  status: 'pending' | 'uploading' | 'done' | 'error';
}
