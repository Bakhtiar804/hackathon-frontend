import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { usePageLoad } from '../lib/usePageLoad.js';
import { Banner, Field, LoadState } from '../components/ui.jsx';
import { Form } from '../components/Form.jsx';
export default function Profile() {
 const {user,refreshMe}=useAuth();
 const [profile,setProfile]=useState(null),[name,setName]=useState(''),[phone,setPhone]=useState(''),[address,setAddress]=useState(''),[password,setPassword]=useState(''),[confirmation,setConfirmation]=useState(''),[error,setError]=useState(null),[ok,setOk]=useState('');
 const initial=usePageLoad(async()=>{const p=await api('/auth/profile',{timeoutMs:15000,retries:0});if(!p?.user?.id)throw new Error('Profile response is incomplete. Please retry.');setProfile(p);setName(p.user.displayName||p.employee?.name||'');setPhone(p.employee?.phone||'');setAddress(p.employee?.address||'');});

 return <div className="stack profile-page"><div className="page-head"><div><div className="brand-kicker">Your account</div><h1>My profile</h1><p className="muted">{user.email} · {user.role} · {user.workspace?.name}</p></div></div><section className="card profile-summary"><div className="profile-avatar" aria-hidden="true">{(user.displayName||user.email)?.[0]?.toUpperCase()}</div><div><h2>{user.displayName||user.email?.split('@')[0]}</h2><p className="muted">{user.email}</p><span className="pill">{user.role}</span></div></section><LoadState state={initial}/><Banner error={error} ok={ok}/>{initial.loading&&<p className="muted small">Loading your editable details… Your account information is shown above.</p>}{initial.loadError&&<p className="muted small">Your profile could not be loaded. Select Try again above to retry.</p>}
 {profile&&!initial.loading&&!initial.loadError&&<Form className="card stack profile-editor" onSubmit={async()=>{setError(null);setOk('');try{if(password!==confirmation)throw new Error('Password confirmation does not match.');await api('/auth/profile',{method:'PATCH',body:{displayName:name.trim(),currentPassword:password,...(profile.employee?{phone,address}:{})}});setOk('Your profile has been updated.');await refreshMe();}catch(e){setError(e);}finally{setPassword('');setConfirmation('');}}}>
 <div><h2>Personal details</h2><p className="muted small">Keep your account details up to date.</p></div><Field label="Display name" name="displayName"><input value={name} onChange={e=>setName(e.target.value)} required maxLength={100} autoComplete="name"/></Field>
 {profile.employee&&<><Field label="Phone" name="phone"><input value={phone} onChange={e=>setPhone(e.target.value)} maxLength={50} autoComplete="tel"/></Field><Field label="Address" name="address"><input value={address} onChange={e=>setAddress(e.target.value)} maxLength={1000} autoComplete="street-address"/></Field></>}
 <div className="profile-security"><h3>Confirm it’s you</h3><p className="muted small">Enter your current sign-in password twice to authorize this update. Display name does not change your official employee record. Email and role remain managed by your administrator.</p>
 <Field label="Current password" name="currentPassword"><input type="password" value={password} onChange={e=>setPassword(e.target.value)} required autoComplete="current-password"/></Field>
 <Field label="Confirm current password" name="confirmation"><input type="password" value={confirmation} onChange={e=>setConfirmation(e.target.value)} required autoComplete="current-password"/></Field>
 </div><div className="profile-save"><span className="muted small">Changes require your current password.</span><button className="btn" type="submit">Update profile</button></div></Form>}{user.employeeId&&<Link className="btn secondary" to="/employees/me">View employee 360</Link>}</div>;
}
