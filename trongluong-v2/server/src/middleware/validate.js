// validate.js — middleware xác thực dữ liệu đầu vào bằng Zod
// Dùng như: router.post('/', validate(orderSchema), handler)

const { z } = require('zod')

// ── Schema cho đơn hàng ──────────────────────────────────────────────────────

const orderCreateSchema = z.object({
  maVanDon: z
    .string({ required_error: 'Thiếu mã vận đơn' })
    .min(5, 'Mã vận đơn tối thiểu 5 ký tự')
    .max(50, 'Mã vận đơn tối đa 50 ký tự')
    .trim(),

  soKy: z
    .number({ required_error: 'Thiếu số ký', invalid_type_error: 'Số ký phải là số' })
    .positive('Số ký phải lớn hơn 0')
    .max(99999, 'Số ký quá lớn'),

  ghiChu: z.string().max(500, 'Ghi chú tối đa 500 ký tự').optional(),
  recordedBy: z.string().max(100).optional(),
  shift: z.enum(['ca_sang', 'ca_dem']).optional(),
  businessDate: z.string().max(20).optional(),
})

const orderUpdateSchema = z.object({
  soKy: z
    .number({ invalid_type_error: 'Số ký phải là số' })
    .positive('Số ký phải lớn hơn 0')
    .max(99999, 'Số ký quá lớn')
    .optional(),

  trangThai: z
    .enum(['cho_xu_ly', 'dang_xu_ly', 'hoan_thanh', 'loi'], {
      errorMap: () => ({ message: 'Trạng thái không hợp lệ' }),
    })
    .optional(),

  ghiChu: z.string().max(500).optional(),
  recordedBy: z.string().max(100).optional(),
  shift: z.enum(['ca_sang', 'ca_dem']).optional(),
  businessDate: z.string().max(20).optional(),
})

// ── Middleware factory ───────────────────────────────────────────────────────

/**
 * Trả về Express middleware validate req.body theo schema Zod
 * Nếu lỗi → trả 400 với danh sách lỗi chi tiết
 * Nếu ok  → gán req.body = data đã parsed (đã trim, đã coerce)
 */
function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body)

    if (!result.success) {
      const errors = result.error.errors.map(e => ({
        field: e.path.join('.'),
        message: e.message,
      }))
      return res.status(400).json({ ok: false, errors })
    }

    // Gán lại body đã được parse + sanitize bởi Zod
    req.body = result.data
    next()
  }
}

module.exports = { validate, orderCreateSchema, orderUpdateSchema }