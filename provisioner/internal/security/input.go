package security

import (
	"regexp"
	"strings"
)

var tokenNamePartPattern = regexp.MustCompile(`[^A-Za-z0-9_.-]+`)

func SafeTokenNamePart(value string, maxLen int) string {
	value = strings.TrimSpace(value)
	value = tokenNamePartPattern.ReplaceAllString(value, "-")
	value = strings.Trim(value, "-_.")
	if value == "" {
		value = "unknown"
	}
	if len(value) > maxLen {
		value = value[:maxLen]
	}
	return value
}

func Truncate(value string, maxLen int) string {
	value = strings.TrimSpace(value)
	if len(value) <= maxLen {
		return value
	}
	return value[:maxLen]
}
