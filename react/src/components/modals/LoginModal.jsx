import React, { useState } from 'react'
import { useAuthContext } from '../../contexts/AuthContext'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { AlertCircle, Loader2, CheckCircle2 } from 'lucide-react'

const LoginModal = ({ onClose }) => {
    const { login, register, loading, error } = useAuthContext()
    const [isLogin, setIsLogin] = useState(true)
    const [registrationSuccess, setRegistrationSuccess] = useState(false)
    const [formData, setFormData] = useState({
        username: '',
        password: ''
    })
    const [localError, setLocalError] = useState('')

    const handleSubmit = async (e) => {
        e.preventDefault()
        setLocalError('')
        setRegistrationSuccess(false)

        if (!formData.username.trim() || !formData.password.trim()) {
            setLocalError('Please fill in all fields')
            return
        }

        const result = isLogin
            ? await login(formData.username, formData.password)
            : await register(formData.username, formData.password)

        if (result.success) {
            if (isLogin) {
                onClose()
            } else {
                // Проверяем, был ли выполнен автоматический вход
                if (result.autoLogin) {
                    // Автоматический вход выполнен, закрываем модальное окно
                    onClose()
                } else {
                    // После успешной регистрации показываем сообщение и переключаем на логин
                    setRegistrationSuccess(true)
                    setFormData({ username: '', password: '' })
                    setTimeout(() => {
                        setIsLogin(true)
                        setRegistrationSuccess(false)
                    }, 2000)
                }
            }
        } else {
            setLocalError(result.error)
        }
    }

    const handleChange = (e) => {
        setFormData(prev => ({
            ...prev,
            [e.target.name]: e.target.value
        }))
        // Очищаем ошибки при изменении полей
        if (localError) setLocalError('')
        if (registrationSuccess) setRegistrationSuccess(false)
    }

    const handleSwitchMode = () => {
        setIsLogin(!isLogin)
        setLocalError('')
        setRegistrationSuccess(false)
        setFormData({ username: '', password: '' })
    }

    const displayError = localError || error

    // Если успешная регистрация, показываем сообщение
    if (registrationSuccess) {
        return (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                <Card className="w-full max-w-md">
                    <CardContent className="p-6">
                        <div className="text-center space-y-4">
                            <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto" />
                            <h3 className="text-lg font-semibold">Registration Successful!</h3>
                            <p className="text-sm text-muted-foreground">
                                Your account has been created successfully. Redirecting to login...
                            </p>
                        </div>
                    </CardContent>
                </Card>
            </div>
        )
    }

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <Card className="w-full max-w-md">
                <CardHeader>
                    <CardTitle>
                        {isLogin ? 'Login' : 'Register'}
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        {displayError && (
                            <div className="bg-destructive/15 text-destructive text-sm p-3 rounded-md flex items-center space-x-2">
                                <AlertCircle className="h-4 w-4" />
                                <span>{displayError}</span>
                            </div>
                        )}

                        <div>
                            <label className="text-sm font-medium">Username</label>
                            <Input
                                name="username"
                                value={formData.username}
                                onChange={handleChange}
                                placeholder="Enter your username"
                                required
                                disabled={loading}
                            />
                        </div>

                        <div>
                            <label className="text-sm font-medium">Password</label>
                            <Input
                                name="password"
                                type="password"
                                value={formData.password}
                                onChange={handleChange}
                                placeholder="Enter your password"
                                required
                                disabled={loading}
                            />
                        </div>

                        <div className="flex space-x-3">
                            <Button
                                type="submit"
                                className="flex-1"
                                disabled={loading}
                            >
                                {loading ? (
                                    <>
                                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                        {isLogin ? 'Logging in...' : 'Registering...'}
                                    </>
                                ) : (
                                    isLogin ? 'Login' : 'Register'
                                )}
                            </Button>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={onClose}
                                disabled={loading}
                            >
                                Cancel
                            </Button>
                        </div>

                        <div className="text-center">
                            <button
                                type="button"
                                onClick={handleSwitchMode}
                                className="text-sm text-primary hover:underline"
                                disabled={loading}
                            >
                                {isLogin ? "Don't have an account? Register" : "Already have an account? Login"}
                            </button>
                        </div>
                    </form>
                </CardContent>
            </Card>
        </div>
    )
}

export default LoginModal
