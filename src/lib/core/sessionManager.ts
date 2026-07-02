// ========================================
// Session Manager - إدارة الجلسات
// ========================================
// لتتبع جلسات المستخدمين ونشاطهم

import { invoke } from '@tauri-apps/api/core';

interface SessionInfo {
  sessionId: string;
  userId: string;
  username: string;
  loginAt: string;
  lastActivity: string;
  deviceInfo: string;
}

class SessionManager {
  private currentSession: SessionInfo | null = null;
  private activityTimer: any = null;
  private readonly ACTIVITY_UPDATE_INTERVAL = 60 * 1000; // دقيقة
  private readonly SESSION_TIMEOUT = 60 * 60 * 1000; // ساعة

  /** بدء جلسة جديدة */
  async startSession(userId: string, username: string): Promise<void> {
    try {
      const deviceInfo = this.getDeviceInfo();
      const sessionId = await invoke<string>('start_session_db', {
        userId, username, deviceInfo,
      }).catch(() => '');
      
      this.currentSession = {
        sessionId: sessionId || crypto.randomUUID(),
        userId,
        username,
        loginAt: new Date().toISOString(),
        lastActivity: new Date().toISOString(),
        deviceInfo,
      };
      
      this.startActivityTracking();
    } catch (e) {
      console.error('[Session] Failed to start session:', e);
    }
  }

  /** إنهاء الجلسة الحالية */
  async endSession(): Promise<void> {
    if (!this.currentSession) return;
    
    try {
      await invoke('end_session_db', {
        sessionId: this.currentSession.sessionId,
      }).catch(() => {});
    } catch (e) {
      console.error('[Session] Failed to end session:', e);
    }
    
    this.stopActivityTracking();
    this.currentSession = null;
  }

  /** تحديث النشاط */
  updateActivity(): void {
    if (!this.currentSession) return;
    this.currentSession.lastActivity = new Date().toISOString();
  }

  /** الحصول على الجلسة الحالية */
  getCurrentSession(): SessionInfo | null {
    return this.currentSession;
  }

  /** التحقق من انتهاء الجلسة */
  isSessionExpired(): boolean {
    if (!this.currentSession) return true;
    const lastActivity = new Date(this.currentSession.lastActivity).getTime();
    return Date.now() - lastActivity > this.SESSION_TIMEOUT;
  }

  /** بدء تتبع النشاط */
  private startActivityTracking(): void {
    this.activityTimer = setInterval(() => {
      this.updateActivity();
      // إرسال للـ backend كل دقيقة
      if (this.currentSession) {
        invoke('update_session_activity_db', {
          sessionId: this.currentSession.sessionId,
        }).catch(() => {});
      }
    }, this.ACTIVITY_UPDATE_INTERVAL);
    
    // تحديث النشاط عند أي تفاعل
    ['click', 'keydown', 'mousemove'].forEach(event => {
      document.addEventListener(event, () => this.updateActivity(), { passive: true });
    });
  }

  /** إيقاف تتبع النشاط */
  private stopActivityTracking(): void {
    if (this.activityTimer) {
      clearInterval(this.activityTimer);
      this.activityTimer = null;
    }
  }

  /** معلومات الجهاز */
  private getDeviceInfo(): string {
    const ua = navigator.userAgent;
    const browser = ua.includes('Chrome') ? 'Chrome' 
                  : ua.includes('Firefox') ? 'Firefox' 
                  : ua.includes('Safari') ? 'Safari' 
                  : 'Unknown';
    const os = ua.includes('Windows') ? 'Windows' 
             : ua.includes('Mac') ? 'macOS' 
             : ua.includes('Linux') ? 'Linux' 
             : 'Unknown';
    return `${os} - ${browser}`;
  }
}

// Singleton
export const sessionManager = new SessionManager();
