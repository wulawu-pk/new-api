package openai

import "github.com/QuantumNous/new-api/relay/helper"

func SanitizeResponsesResponseUsage(payload []byte) []byte {
	return helper.SanitizeResponsesUsageAt(payload, "usage")
}

func SanitizeResponsesEventUsage(payload []byte) []byte {
	return helper.SanitizeResponsesUsageAt(payload, "response.usage")
}
