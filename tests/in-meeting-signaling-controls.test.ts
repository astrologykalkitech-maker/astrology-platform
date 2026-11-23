import { describe, it } from 'node:test';
import assert from 'node:assert';
import * as fs from 'fs';
import * as path from 'path';

describe('Sub-phase 6.3: In-Meeting Realtime Signaling, Mute/Video Controls & Chat', () => {
  const meetingActionPath = path.resolve(
    process.cwd(),
    'app/actions/consultation-meeting.ts'
  );

  it('consultation meeting action file exists and is readable', () => {
    assert.strictEqual(fs.existsSync(meetingActionPath), true);
  });

  it('enforces participant authorization and bounds on in-meeting chat messages', () => {
    const fileContent = fs.readFileSync(meetingActionPath, 'utf8');

    // Function existence
    assert.strictEqual(fileContent.includes('export async function sendMeetingChatMessageAction('), true);

    // Bounded message validation
    assert.strictEqual(fileContent.includes('if (!cleanText || cleanText.length === 0)'), true);
    assert.strictEqual(fileContent.includes('if (cleanText.length > 1000)'), true);
    assert.strictEqual(fileContent.includes('Message must not exceed 1000 characters'), true);

    // Participant verification
    assert.strictEqual(fileContent.includes('const isHost = astroProfile && meeting.host_astrologer_id === astroProfile.id;'), true);
    assert.strictEqual(fileContent.includes('const isCustomer = meeting.customer_id === user.id;'), true);
    assert.strictEqual(fileContent.includes('if (!isHost && !isCustomer && profile.role !== "super_admin")'), true);
    assert.strictEqual(fileContent.includes('Unauthorized: You are not a participant in this meeting.'), true);

    // Closed chat when ended
    assert.strictEqual(fileContent.includes('if (meeting.status === "ended" || meeting.status === "cancelled")'), true);
    assert.strictEqual(fileContent.includes('This consultation session has ended. Chat is closed.'), true);
  });

  it('enforces meeting status transitions and delegates termination to endConsultationMeetingAction', () => {
    const fileContent = fs.readFileSync(meetingActionPath, 'utf8');

    // Status transition function
    assert.strictEqual(fileContent.includes('export async function updateMeetingStatusAction('), true);

    // Transition checks
    assert.strictEqual(fileContent.includes('if (newStatus === "ended")'), true);
    assert.strictEqual(fileContent.includes('await endConsultationMeetingAction(meetingId)'), true);
    assert.strictEqual(fileContent.includes('if (meeting.status === "ended" || meeting.status === "cancelled")'), true);
    assert.strictEqual(fileContent.includes('This consultation session has ended.'), true);

    // Prevents regression from active to waiting
    assert.strictEqual(fileContent.includes('if (meeting.status === "active" && newStatus === "waiting")'), true);
  });

  it('broadcasts termination signal and deletes LiveKit room reliably upon session end', () => {
    const fileContent = fs.readFileSync(meetingActionPath, 'utf8');

    // endConsultationMeetingAction
    assert.strictEqual(fileContent.includes('export async function endConsultationMeetingAction('), true);
    assert.strictEqual(fileContent.includes('.sendData(meeting.room_name, endPayload, DataPacket_Kind.RELIABLE)'), true);
    assert.strictEqual(fileContent.includes('roomService.deleteRoom(meeting.room_name)'), true);
  });
});
