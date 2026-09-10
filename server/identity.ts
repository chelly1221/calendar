export function displayName(value: unknown) {
  if (typeof value !== "string") return "내 계정";
  return value.replace(
    /=\?utf-8\?([bq])\?([^?]*)\?=/gi,
    (_word, encoding: string, body: string) => {
      try {
        return encoding.toLowerCase() === "b"
          ? Buffer.from(body, "base64").toString("utf8")
          : Buffer.from(
              body
                .replaceAll("_", " ")
                .replace(/=([a-f\d]{2})/gi, (_m, hex: string) =>
                  String.fromCharCode(parseInt(hex, 16)),
                ),
              "latin1",
            ).toString("utf8");
      } catch {
        return "내 계정";
      }
    },
  );
}
