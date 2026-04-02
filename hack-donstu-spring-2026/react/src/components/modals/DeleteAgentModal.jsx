import React, { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { AlertTriangle } from 'lucide-react'

const DeleteAgentModal = ({ agent, onClose, onDelete }) => {
    const [confirmationText, setConfirmationText] = useState('')

    const handleDelete = () => {
        if (confirmationText === agent.name) {
            onDelete()
        }
    }

    const canDelete = confirmationText === agent.name

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <Card className="w-full max-w-md">
                <CardHeader>
                    <CardTitle className="text-red-600 flex items-center space-x-2">
                        <AlertTriangle className="h-5 w-5" />
                        <span>Delete Agent</span>
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                        This action cannot be undone. Please type <strong>{agent.name}</strong> to confirm deletion.
                    </p>

                    <Input
                        value={confirmationText}
                        onChange={(e) => setConfirmationText(e.target.value)}
                        placeholder={`Type "${agent.name}" to confirm`}
                    />

                    <div className="flex space-x-3">
                        <Button
                            onClick={handleDelete}
                            disabled={!canDelete}
                            variant="destructive"
                            className="flex-1"
                        >
                            Delete Agent
                        </Button>
                        <Button variant="outline" onClick={onClose}>
                            Cancel
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}

export default DeleteAgentModal
