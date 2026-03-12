const registerForm = document.getElementById('alumniRegisterForm');
if (registerForm) {
  registerForm.addEventListener('submit', async function(event) {
    event.preventDefault();

    const fullName = document.getElementById('name').value;
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const graduationYear = document.getElementById('graduation-year').value;
    const profession = document.getElementById('profession').value;

    const baseUrl = (typeof BACKEND_URL !== 'undefined') ? BACKEND_URL : 'http://localhost:5000';

    try {
      const response = await fetch(`${baseUrl}/api/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullName, email, password, graduationYear, profession, userType: 'alumni' })
      });

      if (response.ok) {
        alert('Alumni registered successfully! You can now log in.');
        window.location.href = 'alumnilogin.html';
      } else {
        const errorText = await response.text();
        alert(`Registration failed: ${errorText}`);
      }
    } catch (error) {
      console.error('Error:', error);
      alert('An error occurred during registration.');
    }
  });
} 

const loginForm = document.getElementById('alumniLoginForm');
if (loginForm) {
  loginForm.addEventListener('submit', async function(event) {
    event.preventDefault();

    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    const baseUrl = (typeof BACKEND_URL !== 'undefined') ? BACKEND_URL : 'http://localhost:5000';

    try {
      const response = await fetch(`${baseUrl}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, userType: 'alumni' })
      });

      if (response.ok) {
        const data = await response.json();
        // Save token and user info for later requests
        localStorage.setItem('token', data.token);
        localStorage.setItem('userType', data.userType);
        localStorage.setItem('userId', data.userId);

        alert('Login successful! Welcome.');
        window.location.href = 'alumni-dashboard.html';
      } else {
        const errorText = await response.text();
        alert(`Login failed: ${errorText}`);
      }
    } catch (error) {
      console.error('Error:', error);
      alert('An error occurred during login.');
    }
  });
}