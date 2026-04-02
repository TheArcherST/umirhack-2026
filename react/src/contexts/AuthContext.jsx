import React, {createContext, useState, useContext, useMemo} from 'react'
import {apiService} from '../services/api'

const AuthContext = createContext(undefined)

export const useAuthContext = () => {
    const context = useContext(AuthContext)
    if (context === undefined) {
        throw new Error('useAuthContext must be used within an AuthProvider')
    }
    return context
}

export const AuthProvider = ({children}) => {
    const [user, setUser] = useState(null)
    const [isAuthenticated, setIsAuthenticated] = useState(false)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState(null)

    const login = async (username, password) => {
        setLoading(true)
        setError(null)

        try {
            const response = await apiService.login(username, password)

            const userData = {
                username,
                login_session_uid: response.login_session_uid
            }
            setUser(userData)
            setIsAuthenticated(true)
            localStorage.setItem('user', JSON.stringify(userData))
            return {success: true}
        } catch (error) {
            const errorMessage = error.message || 'Login failed'
            setError(errorMessage)
            return {success: false, error: errorMessage}
        } finally {
            setLoading(false)
        }
    }

    const register = async (username, password) => {
        setLoading(true)
        setError(null)

        try {
            const response = await apiService.register(username, password)
            
            // Если API регистрации возвращает токены, автоматически входим
            if (response && response.login_session_token && response.login_session_uid) {
                // Устанавливаем токены в API сервисе
                apiService.setToken(response.login_session_token)
                apiService.setUID(response.login_session_uid)
                
                // Устанавливаем пользователя в контексте
                const userData = {
                    username,
                    login_session_uid: response.login_session_uid
                }
                setUser(userData)
                setIsAuthenticated(true)
                localStorage.setItem('user', JSON.stringify(userData))
                
                return {success: true, autoLogin: true}
            } else {
                // Если токены не получены, выполняем обычный логин
                const loginResult = await login(username, password)
                return {success: loginResult.success, autoLogin: true, error: loginResult.error}
            }
        } catch (error) {
            const errorMessage = error.message || 'Registration failed'
            setError(errorMessage)
            return {success: false, error: errorMessage}
        } finally {
            setLoading(false)
        }
    }

    const logout = () => {
        setUser(null)
        setIsAuthenticated(false)
        setError(null)
        apiService.clearToken()
        localStorage.removeItem('user')
    }

    React.useEffect(() => {
        const savedUser = localStorage.getItem('user')
        const savedToken = localStorage.getItem('authToken')

        if (savedUser && savedToken) {
            const userData = JSON.parse(savedUser)
            setUser(userData)
            setIsAuthenticated(true)
            apiService.setToken(savedToken)
        }
    }, [])

    const contextValue = useMemo(() => ({
        user,
        isAuthenticated,
        loading,
        error,
        login,
        register,
        logout
    }), [user, isAuthenticated, loading, error])

    return (
        <AuthContext.Provider value={contextValue}>
            {children}
        </AuthContext.Provider>
    )
}
