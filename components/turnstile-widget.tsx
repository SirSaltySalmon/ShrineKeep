"use client"

import { forwardRef, useEffect, useState } from "react"
import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile"

const CAPTCHA_ERROR_MESSAGE = "Turnstile verification failed"
const SITEKEY_ERROR_MESSAGE = "Failed to load Turnstile site key"

export type TurnstileWidgetRef = TurnstileInstance | null

type TurnstileWidgetProps = {
  onSuccess: (token: string) => void
}

const TurnstileWidget = forwardRef<TurnstileWidgetRef, TurnstileWidgetProps>(
  function TurnstileWidget({ onSuccess }, ref) {
    const [siteKey, setSiteKey] = useState<string | null>(null)
    const [errorMessage, setErrorMessage] = useState<string | null>(null)

    useEffect(() => {
      fetch("/api/auth/captcha/sitekey")
        .then((res) => res.json())
        .then((data) => {
          if (data?.siteKey) setSiteKey(data.siteKey)
        })
        .catch((err) => {
          console.error(SITEKEY_ERROR_MESSAGE, err)
          setErrorMessage(SITEKEY_ERROR_MESSAGE)
        })
    }, [])

    if (!siteKey) return null

    return (
      <div className="overflow-auto-x flex justify-center">
        <Turnstile
          ref={ref}
          siteKey={siteKey}
          onSuccess={onSuccess}
          onError={(err) => {
            console.error("Turnstile error:", err)
            setErrorMessage(CAPTCHA_ERROR_MESSAGE)
          }}
        />
        {errorMessage && (
          <div className="w-full text-fluid-sm text-destructive bg-destructive/10 p-3 rounded-md min-w-0 overflow-hidden break-words">
            {errorMessage}
          </div>
        )}
      </div>
    )
  }
)

export default TurnstileWidget
