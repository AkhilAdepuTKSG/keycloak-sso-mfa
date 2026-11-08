<#--
  Identifier-first login form for the citizen realm (CitizenIdentifierAuthenticator).
  Shipped in the provider jar under theme-resources/, so it works with the stock
  keycloak.v2 login theme. Attributes:
    c360Portal      client display name ("NIS Portal")
    c360IdLabel     label for the ID field, from the client attribute citizen.login.id_label
    c360Chips       ID types this client accepts
    c360Hints       one format hint per accepted type
    c360Identifier  what the user typed last time (re-shown after an error)
-->
<#import "template.ftl" as layout>
<#import "buttons.ftl" as buttons>
<@layout.registrationLayout displayMessage=true displayInfo=true; section>
<#if section = "header">
    ${msg("c360SignInTitle", c360Portal)}
<#elseif section = "form">
    <style>
      .c360-accepts { margin: 0 0 1rem; font-size: .9rem; color: var(--pf-v5-global--Color--200, #6a6e73); }
      .c360-chip { display: inline-block; margin: .15rem .3rem .15rem 0; padding: .1rem .55rem; border-radius: 999px;
                   background: #e1f0e7; color: #0a6b45; font-weight: 600; font-size: .8rem; }
      .c360-hints { margin: .35rem 0 0; padding-left: 1.1rem; font-size: .8rem; color: var(--pf-v5-global--Color--200, #6a6e73); }
      .c360-hints li { margin: 0; }
    </style>
    <p class="c360-accepts" id="c360-accepted">${msg("c360AcceptedHere")}
      <#list c360Chips as chip><span class="c360-chip">${chip}</span></#list>
    </p>
    <form id="kc-form-login" class="${properties.kcFormClass!}" onsubmit="login.disabled = true; return true;"
          action="${url.loginAction}" method="post" novalidate="novalidate">
        <div class="${properties.kcFormGroupClass!}">
            <div class="${properties.kcFormGroupLabelClass!}">
                <label for="identifier" class="${properties.kcFormLabelClass!}">
                    <span class="${properties.kcFormLabelTextClass!}">${c360IdLabel}</span>
                </label>
            </div>
            <span class="${properties.kcInputClass!}">
                <input id="identifier" name="identifier" type="text" value="${c360Identifier}" autofocus
                       autocomplete="username" spellcheck="false" autocapitalize="characters"
                       aria-describedby="c360-hints"/>
            </span>
            <ul class="c360-hints" id="c360-hints">
                <#list c360Hints as hint><li>${hint}</li></#list>
            </ul>
        </div>
        <div class="${properties.kcFormGroupClass!}">
            <div class="${properties.kcFormGroupLabelClass!}">
                <label for="password" class="${properties.kcFormLabelClass!}">
                    <span class="${properties.kcFormLabelTextClass!}">${msg("password")}</span>
                </label>
            </div>
            <span class="${properties.kcInputClass!}">
                <input id="password" name="password" type="password" autocomplete="current-password"/>
            </span>
        </div>
        <@buttons.loginButton />
    </form>
<#elseif section = "info">
    <div id="kc-registration-container">
        <span>${msg("c360NoAccount")}</span>
    </div>
</#if>
</@layout.registrationLayout>
