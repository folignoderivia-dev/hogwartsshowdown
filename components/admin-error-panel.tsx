"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { getRecentErrors, type AppError } from "@/lib/database"
import { X, AlertTriangle, User, Clock, FileText, Globe } from "lucide-react"

interface AdminErrorPanelProps {
  isOpen: boolean
  onClose: () => void
  currentUser: { id: string; username: string; isAdmin?: boolean }
}

export default function AdminErrorPanel({ isOpen, onClose, currentUser }: AdminErrorPanelProps) {
  const [errors, setErrors] = useState<AppError[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedError, setSelectedError] = useState<AppError | null>(null)

  useEffect(() => {
    if (isOpen && currentUser.isAdmin) {
      loadErrors()
    }
  }, [isOpen, currentUser])

  const loadErrors = async () => {
    setLoading(true)
    try {
      const data = await getRecentErrors(100)
      setErrors(data)
    } catch (error) {
      console.error("Failed to load errors:", error)
    } finally {
      setLoading(false)
    }
  }

  if (!currentUser.isAdmin) {
    return null
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <Card className="w-full max-w-6xl max-h-[90vh] overflow-hidden bg-stone-900 border-amber-700">
        <CardHeader className="border-b border-amber-700/50 bg-stone-800">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-amber-200">
              <AlertTriangle className="h-5 w-5 text-red-400" />
              Admin Panel - Error Log
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="text-amber-400 hover:text-amber-200 hover:bg-stone-700"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="flex h-[70vh]">
            {/* Error List */}
            <div className="w-1/2 overflow-y-auto border-r border-amber-700/30 p-4">
              {loading ? (
                <p className="text-amber-400">Loading errors...</p>
              ) : errors.length === 0 ? (
                <p className="text-amber-400">No errors logged.</p>
              ) : (
                <div className="space-y-2">
                  {errors.map((error) => (
                    <div
                      key={error.id}
                      onClick={() => setSelectedError(error)}
                      className={`cursor-pointer rounded border p-3 transition-colors ${
                        selectedError?.id === error.id
                          ? "border-amber-500 bg-amber-900/30"
                          : "border-amber-700/50 bg-stone-800 hover:border-amber-600 hover:bg-stone-700"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <Badge className="bg-red-900/50 text-red-200 border-red-700 text-xs">
                              {error.errorName}
                            </Badge>
                            {error.component && (
                              <Badge className="bg-blue-900/50 text-blue-200 border-blue-700 text-xs">
                                {error.component}
                              </Badge>
                            )}
                          </div>
                          <p className="mt-1 text-xs text-amber-300 line-clamp-2">{error.errorMessage}</p>
                        </div>
                        <div className="flex items-center gap-1 text-xs text-amber-500">
                          <Clock className="h-3 w-3" />
                          {new Date(error.timestamp).toLocaleString()}
                        </div>
                      </div>
                      <div className="mt-2 flex items-center gap-3 text-xs text-amber-400">
                        <div className="flex items-center gap-1">
                          <User className="h-3 w-3" />
                          {error.username}
                        </div>
                        {error.url && (
                          <div className="flex items-center gap-1">
                            <Globe className="h-3 w-3" />
                            <span className="truncate max-w-[150px]">{error.url}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Error Detail */}
            <div className="w-1/2 overflow-y-auto p-4">
              {selectedError ? (
                <div className="space-y-4">
                  <div>
                    <h3 className="text-sm font-semibold text-amber-400 mb-2">Error Details</h3>
                    <div className="space-y-2 text-sm">
                      <div className="flex items-center gap-2">
                        <Badge className="bg-red-900/50 text-red-200 border-red-700">{selectedError.errorName}</Badge>
                        {selectedError.component && (
                          <Badge className="bg-blue-900/50 text-blue-200 border-blue-700">{selectedError.component}</Badge>
                        )}
                      </div>
                      <div className="rounded border border-amber-700/50 bg-stone-800 p-3">
                        <p className="text-amber-200">{selectedError.errorMessage}</p>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold text-amber-400 mb-2">User Info</h3>
                    <div className="space-y-1 text-sm text-amber-300">
                      <p><span className="text-amber-500">User ID:</span> {selectedError.userId}</p>
                      <p><span className="text-amber-500">Username:</span> {selectedError.username}</p>
                      {selectedError.userAgent && (
                        <p><span className="text-amber-500">User Agent:</span> {selectedError.userAgent}</p>
                      )}
                    </div>
                  </div>

                  {selectedError.url && (
                    <div>
                      <h3 className="text-sm font-semibold text-amber-400 mb-2">URL</h3>
                      <p className="text-sm text-amber-300 break-all">{selectedError.url}</p>
                    </div>
                  )}

                  {selectedError.stackTrace && (
                    <div>
                      <h3 className="text-sm font-semibold text-amber-400 mb-2">Stack Trace</h3>
                      <div className="rounded border border-amber-700/50 bg-stone-950 p-3">
                        <pre className="text-xs text-amber-300 whitespace-pre-wrap font-mono">{selectedError.stackTrace}</pre>
                      </div>
                    </div>
                  )}

                  <div>
                    <h3 className="text-sm font-semibold text-amber-400 mb-2">Timestamp</h3>
                    <p className="text-sm text-amber-300">{new Date(selectedError.timestamp).toLocaleString()}</p>
                  </div>
                </div>
              ) : (
                <div className="flex h-full items-center justify-center text-amber-500">
                  <p>Select an error to view details</p>
                </div>
              )}
            </div>
          </div>

          <div className="border-t border-amber-700/30 p-4 bg-stone-800">
            <Button onClick={loadErrors} className="w-full bg-amber-700 hover:bg-amber-600 text-white">
              Refresh Errors
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
