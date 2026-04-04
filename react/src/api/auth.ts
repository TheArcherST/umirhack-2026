import apiClient from './client'
import type {
    LoginPayload,
    LoginResponse,
    RegisterPayload,
    RegisterResponse,
    VerifyCodePayload,
    VerifyResponse,
    ResendCodePayload,
    ResendResponse,
    ApiError,
} from './types'

function extractError(err: any): string {
    const data: ApiError | undefined = err.response?.data
    if (data?.detail?.[0]?.msg) return data.detail[0].msg
    return err.response?.data?.detail ?? 'Something went wrong'
}

export async function apiLogin(payload: LoginPayload): Promise<LoginResponse> {
    const res = await apiClient.post<LoginResponse>('/login', {
        username: payload.username,
        password: payload.password,
    })
    return res.data
}

export async function apiRegister(payload: RegisterPayload): Promise<RegisterResponse> {
    const res = await apiClient.post<RegisterResponse>('/register', {
        username: payload.username,
        password: payload.password,
        email: payload.email,
    })
    return res.data
}

export async function apiVerifyCode(payload: VerifyCodePayload): Promise<VerifyResponse> {
    const res = await apiClient.post<VerifyResponse>('/auth/email/verify', {
        username: payload.username,
        code: payload.code,
    })
    return res.data
}

export async function apiResendCode(payload: ResendCodePayload): Promise<ResendResponse> {
    const res = await apiClient.post<ResendResponse>('/auth/email/resend', {
        username: payload.username,
    })
    return res.data
}

export { extractError }
