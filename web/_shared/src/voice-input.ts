type SpeechRecognitionAlternative = {
	transcript: string;
	confidence: number;
};

type SpeechRecognitionResult = ArrayLike<SpeechRecognitionAlternative> & {
	isFinal: boolean;
};

type SpeechRecognitionResultList = ArrayLike<SpeechRecognitionResult>;

type SpeechRecognitionEvent = {
	results: SpeechRecognitionResultList;
};

type SpeechRecognitionErrorEvent = {
	error: string;
	message: string;
};

type SpeechRecognitionInstance = {
	lang: string;
	continuous: boolean;
	interimResults: boolean;
	onresult: ((event: SpeechRecognitionEvent) => void) | null;
	onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
	onend: (() => void) | null;
	start(): void;
	stop(): void;
	abort(): void;
};

type SpeechRecognitionCtor = new () => SpeechRecognitionInstance;

declare global {
	interface Window {
		SpeechRecognition?: SpeechRecognitionCtor;
		webkitSpeechRecognition?: SpeechRecognitionCtor;
	}
}

export type VoiceInputOptions = {
	onInterim: (text: string) => void;
	onFinal: (text: string) => void;
	onError: (message: string) => void;
	onEnd: () => void;
	lang?: string;
};

export class VoiceInput {
	private readonly options: VoiceInputOptions;
	private recognition: SpeechRecognitionInstance | null = null;
	private running = false;

	constructor(options: VoiceInputOptions) {
		this.options = options;
	}

	static isSupported(): boolean {
		return (
			window.SpeechRecognition !== undefined ||
			window.webkitSpeechRecognition !== undefined
		);
	}

	isRunning(): boolean {
		return this.running;
	}

	start(): void {
		if (this.running === true) return;
		const Ctor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
		if (Ctor === undefined) {
			this.options.onError('Speech recognition not supported in this browser.');
			this.options.onEnd();
			return;
		}
		if (this.recognition === null) {
			const recognition = new Ctor();
			recognition.lang = this.options.lang ?? 'en-US';
			recognition.continuous = false;
			recognition.interimResults = true;
			recognition.onresult = (event) => this.handleResult(event);
			recognition.onerror = (event) => {
				this.options.onError(
					event.message !== '' ? event.message : event.error,
				);
			};
			recognition.onend = () => {
				this.running = false;
				this.options.onEnd();
			};
			this.recognition = recognition;
		}
		this.running = true;
		this.recognition.start();
	}

	stop(): void {
		if (this.running === false || this.recognition === null) return;
		this.recognition.stop();
	}

	private handleResult(event: SpeechRecognitionEvent): void {
		let finalText = '';
		let interimText = '';
		for (let i = 0; i < event.results.length; i++) {
			const result = event.results[i];
			const transcript = result[0]?.transcript ?? '';
			if (result.isFinal === true) {
				finalText += transcript;
			} else {
				interimText += transcript;
			}
		}
		if (finalText !== '') {
			this.options.onFinal(finalText);
		}
		if (interimText !== '') {
			this.options.onInterim(interimText);
		}
	}
}
