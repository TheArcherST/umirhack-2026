import axios from 'axios'

function normalizeApiBaseUrl(rawBaseUrl?: string): string {
    const trimmed = (rawBaseUrl ?? '').trim().replace(/\/+$/, '')
    if (!trimmed) return '/api'
    return trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`
}

export const API_BASE_URL = normalizeApiBaseUrl(import.meta.env.VITE_API_URL ?? 'http://localhost:8000')

export const apiClient = axios.create({
    baseURL: API_BASE_URL,
    timeout: 10_000,
    headers: {'Content-Type': 'application/json'},
})

// Attach auth token from localStorage
apiClient.interceptors.request.use((config) => {
    const token = localStorage.getItem('auth_token')
    if (token) config.headers.Authorization = `Bearer ${token}`
    return config
})

// Handle 401 globally
apiClient.interceptors.response.use(
    (res) => res,
    (err) => {
        const hasToken = Boolean(localStorage.getItem('auth_token'))
        if (err.response?.status === 401 && hasToken && window.location.pathname !== '/login') {
            localStorage.removeItem('auth_token')
            localStorage.removeItem('auth_user')
            window.location.href = '/login'
        }
        return Promise.reject(err)
    },
)

export default apiClient
