// extension/mic-permission.js
// Requests microphone permission from a visible extension page (a user gesture
// here grants the permission to the whole extension origin, including the
// invisible offscreen document that does the actual recording).

const btn = document.getElementById('grant');
const status = document.getElementById('status');

btn.addEventListener('click', async () => {
  status.textContent = '';
  status.className = 'status';
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    // We only needed the grant — release the device immediately.
    stream.getTracks().forEach((t) => t.stop());
    status.textContent = '✓ Microphone enabled. You can close this tab and go back to Talk to Teacher.';
    status.className = 'status ok';
    btn.disabled = true;
    setTimeout(() => { window.close(); }, 2500);
  } catch (err) {
    if (err && (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError')) {
      status.textContent = 'No microphone was found. Please connect one and try again.';
    } else {
      status.textContent = 'Permission was blocked. Click the camera/mic icon in the address bar to allow it, then try again.';
    }
    status.className = 'status err';
  }
});
