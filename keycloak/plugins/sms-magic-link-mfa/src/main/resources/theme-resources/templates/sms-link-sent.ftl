<#import "template.ftl" as layout>
<@layout.registrationLayout displayInfo=true; section>
    <#if section = "header">
        ${msg("smsLinkSentTitle")}
    <#elseif section = "form">
        <p class="instruction">${msg("smsLinkSentInfo")}</p>
    </#if>
</@layout.registrationLayout>
