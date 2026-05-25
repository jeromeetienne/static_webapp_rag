export class Device {
	static isMobile(): boolean {
		if (typeof navigator === 'undefined') return false;
		return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
	}
}
