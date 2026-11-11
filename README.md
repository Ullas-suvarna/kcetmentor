# KCET Gen Z - Web Mentor Panel

A high-performance, real-time Web Mentor Panel for **KCET Gen Z** (Karnataka's #1 KCET Entrance Prep Hub), engineered for 100% data and operational parity with the Android Mentor App.

---

## 🚀 Quick Start

### Option 1: Native Node Server (Recommended)
No `npm install` needed! Run the built-in zero-dependency HTTP server:
```bash
npm start
```
or:
```bash
node server.js
```
Then open your browser to: **`http://localhost:3000`**

### Option 2: Direct File Open
You can also open `index.html` directly in modern web browsers (Chrome, Edge, Firefox, Brave) or via VS Code Live Server.

---

## 🔑 Mentor Login Credentials

| Role | Email ID | Password / Profile PIN |
|---|---|---|
| **Senior Mentor (Main Admin)** | `ullassuvarna85@gmail.com` | `Ullas@17082006` |

*Convenience:* On the login screen, click **"Auto-fill Ullas Suvarna"** to instantly test authentication.

---

## 🏗️ Architecture & Database Synchronization

The Web Mentor Panel interfaces directly with the same Firebase project as the Android App (`kcet-app-c0457`):

### 1. Firestore Database (`cloud_firestore`)
- **Mentor Profiles** (`registered_mentors/{email_or_id}`):
  - `name`: Full Display Name
  - `email`: Mentor's Unique Key
  - `phone`: Contact Phone Number
  - `qualification`: Qualification / Expertise (e.g. `B.Tech from IIT / Verified Mentor`)
  - `experience`: Coaching Experience (e.g. `2+ Years / Strategy Coach`)
  - `specialty`: Coaching Subject / Stream (e.g. `Engineering (B.E - CSE / AI)`)
  - `bio`: Mentor Bio & KCET Rank target advice
  - `telegramOrInstagram`: Social Handle
  - `password`: PIN used for "Profile Unlock" in the app
  - `status`: Default `"Active"`
  - `createdAt`, `lastUpdated`: Epoch timestamps

- **Booking Records** (`senior_chat_bookings/{bookingId}`):
  - `bookingId`: Unique session identifier (e.g. `BK_1723456789`)
  - `userId`, `userName`, `userEmail`: Student credentials
  - `selectedDate`, `selectedTime`: Scheduled slot
  - `mentorName`, `assignedMentorEmail`: Assigned Senior Mentor
  - `status`:
    - `"Under Verification"`: Awaiting admin payment verification
    - `"Waiting for Senior Confirmation"`: Verified, awaiting mentor click **"Accept"**
    - `"Confirmed"`: Active 1-on-1 session; Realtime Chat unlocked
    - `"Rejected by Mentor"`: Declined slot with reason
    - `"Expired"` / `"Completed"`
  - `amountPaid`: ₹50 per session
  - `paymentRefNumber`: UTR / Transaction ID
  - `adminMessage`: Notes from admin or mentor acceptance log
  - `rejectionReason`: Stored if mentor declines

### 2. Realtime Database (RTDB)
- **1-to-1 Live Student Chat** (`oneToOneChats/{bookingId}/messages/{msgId}`):
  - Sub-50ms latency messaging
  - Fields: `messageId`, `senderId`, `senderName`, `message`, `timestamp`, `sentBySenior: true`, `avatarUrl`
- **Global Senior Mentors Community** (`seniorChats/senior_chat_global/messages/{msgId}`):
  - Real-time communication between registered senior mentors

---

## 💻 Laptop & Desktop UI Features

1. **Authentic KCET Gen Z Login Interface**:
   - Matching graduation cap logo ("KG") and brand gradient
   - Email/Mobile & Password inputs with password reveal toggle
   - **Customized**: "Continue with Google" and "Register Now" removed as requested.
2. **Laptop-First Multi-Column Dashboard**:
   - Wide 4-card statistics row (Assigned Students, Pending Requests, Active Chats, Total Revenue)
   - Quick Action Urgent Pending Requests feed
   - Confirmed Students Quick Connect list
3. **1-on-1 Split-Screen Live Chat (Realtime Database)**:
   - Left Pane: Confirmed assigned students directory with quick search
   - Right Pane: Real-time chat feed with auto-scroll
   - Senior Mentor messages styled in KCET Blue bubbles with "You (Senior Mentor)" tag
   - Student messages styled in clean white card bubbles
   - Quick Canned Responses bar for instant tips
   - Audio chime for incoming student messages
4. **Pending Requests Manager**:
   - Filter tabs: *All Pending*, *Waiting for Senior Confirmation*, *Under Verification*
   - ✅ **Accept Button**: Updates Firestore `status="Confirmed"`, `assignedMentorEmail`, `mentorName`, `adminMessage`, and transitions immediately into live chat.
   - ❌ **Reject Button**: Opens modal to enter `rejectionReason`, updates Firestore `status="Rejected by Mentor"`.
5. **My Profile Editor**:
   - Edit name, phone, qualifications, specialties, bio, social handle, and PIN
   - Saves directly to Firestore `registered_mentors`
6. **Senior Mentors Directory & Registration**:
   - Directory matching the Android app's "Mentor Profile Access & Registration" screen
   - PIN Unlock modal to switch mentor profile
   - "Register as Mentor" form to onboard new senior mentors into Firestore
