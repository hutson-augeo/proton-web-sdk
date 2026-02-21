import { useSelector } from 'react-redux';
import { selectUser, selectUserAvatar, setUser } from '../store/slices/user.slice';
import * as SDK from "../webSdk";
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppDispatch } from '../hooks/store';

export const Avatar = () => {

  const user = useSelector(selectUser)
  const avatar = useSelector(selectUserAvatar)
  const didReconnect = useRef(false)
  // True while the initial reconnect attempt is in flight — prevents Login flash
  const [initializing, setInitializing] = useState(true)

  const dispatch = useAppDispatch()

  const clear = useCallback(() => dispatch(
    setUser({
      actor: '',
      permission: '',
      accountData: undefined
    })
  ), [dispatch])

  const login = useCallback(async (reconnect: boolean = false) => {
    // Don't clear during reconnect — it would flash the Login button
    if (!reconnect) clear();

    if (reconnect) {
      await SDK.reconnect();
    } else {
      await SDK.login();
    }

    if (SDK.session && SDK.session.auth) {
      dispatch(
        setUser({
          actor: SDK.session.auth.actor.toString(),
          permission: SDK.session.auth.permission.toString(),
          accountData: await SDK.getProtonAvatar(SDK.session.auth.actor.toString())
        })
      );
    }
  }, [clear, dispatch])

  useEffect(() => {
    if (didReconnect.current) return
    didReconnect.current = true
    login(true).finally(() => setInitializing(false))
  }, [login])

  const logout = async () => {
    await SDK.logout();
    clear();
  }

  // While reconnect is in flight show a neutral placeholder — same height as
  // the login button so nothing shifts when the real state resolves
  if (initializing) {
    return (
      <div className="h-8 w-20 rounded-md bg-gray-800 animate-pulse" />
    )
  }

  if (!user.actor) {
    return (
      <div
        onClick={() => login()}
        className="cursor-pointer whitespace-nowrap bg-purple-100 border border-transparent rounded-md py-1 px-3 inline-flex items-center justify-center text-sm font-medium text-purple-600 hover:bg-purple-200"
      >
        Login
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <img
        className="h-6 w-6 rounded-full hidden sm:block"
        src={avatar}
        alt="Profile"
      />
      <span className="font-mono text-xs text-gray-300">{user.actor}</span>
      <svg
        aria-hidden="true"
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 448 512"
        onClick={() => logout()}
        className="w-3 h-3 cursor-pointer text-gray-600 hover:text-gray-300 transition-colors"
      >
        <path
          fill="currentColor"
          d="M268 416h24a12 12 0 0 0 12-12V188a12 12 0 0 0-12-12h-24a12 12 0 0 0-12 12v216a12 12 0 0 0 12 12zM432 80h-82.41l-34-56.7A48 48 0 0 0 274.41 0H173.59a48 48 0 0 0-41.16 23.3L98.41 80H16A16 16 0 0 0 0 96v16a16 16 0 0 0 16 16h16v336a48 48 0 0 0 48 48h288a48 48 0 0 0 48-48V128h16a16 16 0 0 0 16-16V96a16 16 0 0 0-16-16zM171.84 50.91A6 6 0 0 1 177 48h94a6 6 0 0 1 5.15 2.91L293.61 80H154.39zM368 464H80V128h288zm-212-48h24a12 12 0 0 0 12-12V188a12 12 0 0 0-12-12h-24a12 12 0 0 0-12 12v216a12 12 0 0 0 12 12z"
        />
      </svg>
    </div>
  );
}