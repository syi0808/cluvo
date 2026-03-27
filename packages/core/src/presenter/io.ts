export type WriteFn = (chunk: string) => boolean

export function readYesNo(stdin: typeof process.stdin, write: WriteFn): Promise<boolean> {
	return new Promise((resolve) => {
		if (!stdin.isTTY) {
			resolve(false)
			return
		}
		stdin.setRawMode(true)
		stdin.resume()
		stdin.once('data', (data) => {
			stdin.setRawMode(false)
			stdin.pause()
			const char = data.toString().trim().toLowerCase()
			write(char === 'n' ? 'n\n' : 'Y\n')
			resolve(char !== 'n')
		})
	})
}

export function readKey(stdin: typeof process.stdin, write: WriteFn): Promise<string> {
	return new Promise((resolve) => {
		stdin.setRawMode(true)
		stdin.resume()
		stdin.once('data', (data) => {
			stdin.setRawMode(false)
			stdin.pause()
			const char = data.toString().trim().toLowerCase()
			write(`${char}\n`)
			resolve(char)
		})
	})
}
